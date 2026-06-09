"""
TimerMaster 一键构建 + 发布脚本
用法:
  python scripts/build-and-release.py                    # 自动判断 + 环境变量 Token
  python scripts/build-and-release.py <Token>            # 自动判断 + 传 Token
  python scripts/build-and-release.py patch <Token>      # 强制 patch
  python scripts/build-and-release.py minor <Token>      # 强制 minor
  python scripts/build-and-release.py major <Token>      # 强制 major
  python scripts/build-and-release.py v2.0.1 <Token>     # 指定版本

自动检测规则（Conventional Commits）:
  含 `feat:` → minor  (4.4.1 → 4.5.0)  ← 加功能
  含 BREAKING → major  (4.5.0 → 5.0.0)  ← 重大变更
  其他       → patch  (4.5.0 → 4.5.1)  ← 修 Bug、文档等
"""
import os
import sys
import json
import subprocess
import re
from datetime import datetime, timezone

# ─── 配置 ───────────────────────────────────────────────
REPO = "Alin2077/TimerMaster"
PROJECT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# ───────────────────────────────────────────────────────


def run(cmd, cwd=None):
    """Run a shell command and print output."""
    print(f"\n$ {' '.join(cmd)}")
    result = subprocess.run(cmd, cwd=cwd or PROJECT_DIR, capture_output=True, text=True, shell=True)
    if result.stdout:
        print(result.stdout)
    if result.stderr:
        print(result.stderr)
    if result.returncode != 0:
        print(f"❌ 命令失败 (exit code {result.returncode})")
        sys.exit(result.returncode)
    return result


def read_current_version():
    """从 tauri.conf.json 读取当前版本号."""
    conf_path = os.path.join(PROJECT_DIR, "src-tauri", "tauri.conf.json")
    with open(conf_path, "r") as f:
        conf = json.load(f)
    return conf["version"]


def bump_version(current: str, bump_type: str) -> str:
    """
    根据 SemVer 规则递增版本号：
    - patch: 2.0.0 → 2.0.1  (修订号+1)
    - minor: 2.0.1 → 2.1.0  (次版本+1, 修订号归零)
    - major: 2.1.0 → 3.0.0  (主版本+1, 次版本+修订号归零)
    """
    parts = current.split(".")
    major = int(parts[0])
    minor = int(parts[1]) if len(parts) > 1 else 0
    patch = int(parts[2]) if len(parts) > 2 else 0

    if bump_type == "major":
        return f"{major + 1}.0.0"
    elif bump_type == "minor":
        return f"{major}.{minor + 1}.0"
    else:  # patch
        return f"{major}.{minor}.{patch + 1}"


def update_version_in_files(new_version: str):
    """更新 tauri.conf.json 和 Cargo.toml 中的版本号."""
    # 更新 tauri.conf.json
    conf_path = os.path.join(PROJECT_DIR, "src-tauri", "tauri.conf.json")
    with open(conf_path, "r") as f:
        conf = json.load(f)
    old_version = conf["version"]
    conf["version"] = new_version
    with open(conf_path, "w") as f:
        json.dump(conf, f, indent=2)
    print(f"  📝 tauri.conf.json: {old_version} → {new_version}")

    # 更新 Cargo.toml
    cargo_path = os.path.join(PROJECT_DIR, "src-tauri", "Cargo.toml")
    with open(cargo_path, "r") as f:
        cargo = f.read()
    cargo = re.sub(
        r'^version\s*=\s*"[^"]+"',
        f'version = "{new_version}"',
        cargo,
        count=1,
        flags=re.MULTILINE,
    )
    with open(cargo_path, "w") as f:
        f.write(cargo)
    print(f"  📝 Cargo.toml: {old_version} → {new_version}")


def detect_bump_type() -> str:
    """
    分析自上一个标签以来的 commit，按 Conventional Commits 规范决定版本递增：
    - major: 任意 commit 包含 BREAKING CHANGE 标记
    - minor: 存在 feat 类型 commit（且无 BREAKING CHANGE）
    - patch: 其他所有（fix, docs, chore, refactor, test 等）
    """
    # 优先用 git describe 找最近标签，失败则从 tag 列表取最新的 v* 标签
    last_tag = None
    tag_result = subprocess.run(
        ["git", "describe", "--tags", "--match", "v*", "--abbrev=0"],
        cwd=PROJECT_DIR, capture_output=True, text=True,
    )
    if tag_result.returncode == 0:
        last_tag = tag_result.stdout.strip()

    if not last_tag:
        # 回退：取所有 v* 标签中最新一个
        list_result = subprocess.run(
            ["git", "tag", "--list", "v*", "--sort=-v:refname"],
            cwd=PROJECT_DIR, capture_output=True, text=True,
        )
        tags = [t.strip() for t in list_result.stdout.strip().split("\n") if t.strip()]
        if tags:
            last_tag = tags[0]

    if last_tag:
        result = subprocess.run(
            ["git", "log", f"{last_tag}..HEAD", "--oneline", "--no-decorate"],
            cwd=PROJECT_DIR, capture_output=True, text=True,
        )
        print(f"  📋 基于标签 {last_tag} 检测")
    else:
        result = subprocess.run(
            ["git", "log", "--oneline", "--no-decorate", "-30"],
            cwd=PROJECT_DIR, capture_output=True, text=True,
        )
        print(f"  📋 无标签，取最近 30 条 commit")

    commits = result.stdout.strip().split("\n")
    # 跳过自动版本号提交
    commits = [c for c in commits if not re.match(r'^[a-f0-9]+\s+chore: bump to v\d', c, re.I)]
    commits = [c for c in commits if c.strip()]

    has_breaking = False
    has_feat = False

    for commit in commits:
        msg = re.sub(r'^[a-f0-9]+\s+', '', commit).strip()

        # BREAKING CHANGE（不区分大小写）
        if "BREAKING CHANGE" in msg or "breaking change" in msg.lower():
            has_breaking = True

        # feat: 或 feat(scope): 开头
        if re.match(r'^feat(\(|:)', msg.lower()):
            has_feat = True

    if has_breaking:
        return "major"
    if has_feat:
        return "minor"
    return "patch"


def get_commit_log_since_last_tag():
    """只获取自上一个标签以来的 commit 作为更新日志."""
    # 获取最后一个标签
    last_tag = None
    tag_result = subprocess.run(
        ["git", "describe", "--tags", "--match", "v*", "--abbrev=0"],
        cwd=PROJECT_DIR, capture_output=True, text=True,
    )
    if tag_result.returncode == 0:
        last_tag = tag_result.stdout.strip()

    if not last_tag:
        list_result = subprocess.run(
            ["git", "tag", "--list", "v*", "--sort=-v:refname"],
            cwd=PROJECT_DIR, capture_output=True, text=True,
        )
        tags = [t.strip() for t in list_result.stdout.strip().split("\n") if t.strip()]
        if tags:
            last_tag = tags[0]

    if last_tag:
        result = subprocess.run(
            ["git", "log", f"{last_tag}..HEAD", "--oneline", "--no-decorate"],
            cwd=PROJECT_DIR, capture_output=True, text=True,
        )
    else:
        result = subprocess.run(
            ["git", "log", "--oneline", "--no-decorate", "-30"],
            cwd=PROJECT_DIR, capture_output=True, text=True,
        )

    lines = result.stdout.strip().split("\n")
    if not lines or lines[0] == "":
        return "无新增变更"

    notes = []
    for line in lines[:50]:
        match = re.match(r'^([a-f0-9]+)\s+(.*)', line)
        if match:
            msg = match.group(2)
            # 跳过自动生成的版本号提交
            if re.match(r'^chore: bump to v\d', msg):
                continue
            notes.append(f"- {msg}")
    return "\n".join(notes) if notes else "无新增变更"


def main():
    # ── 0. 解析参数 ──
    # 用法:
    #   python scripts/build-and-release.py              # 自动检测 + 从环境变量读 Token
    #   python scripts/build-and-release.py <Token>      # 自动检测 + 显式传 Token
    #   python scripts/build-and-release.py minor <Token> # 手动指定 + 显式传 Token
    #   python scripts/build-and-release.py v2.0.1 <Token> # 指定版本

    bump_type_or_version = "auto"
    github_token = ""

    if len(sys.argv) == 1:
        # 无参数：自动检测，从环境变量读 Token
        bump_type_or_version = "auto"
        github_token = os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN", "")
    elif len(sys.argv) == 2:
        arg = sys.argv[1]
        if arg.startswith("v") or arg in ("patch", "minor", "major"):
            bump_type_or_version = arg
            github_token = os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN", "")
        else:
            bump_type_or_version = "auto"
            github_token = arg
    else:
        bump_type_or_version = sys.argv[1]
        github_token = sys.argv[2]

    if not github_token:
        print("❌ 需要 GitHub Token")
        print("   用法: set GH_TOKEN=ghp_xxx && python scripts/build-and-release.py")
        sys.exit(1)

    # ── 自动检测版本递增类型 ──
    if bump_type_or_version == "auto":
        bump_type_or_version = detect_bump_type()
        print(f"  🔍 检测到: {bump_type_or_version}")

    # ── 1. 计算版本号 ──
    if bump_type_or_version.startswith("v"):
        # 显式指定版本号（向后兼容）
        tag = bump_type_or_version
        version = tag.lstrip("v")
        # 更新文件中的版本号
        update_version_in_files(version)
    elif bump_type_or_version in ("patch", "minor", "major"):
        current = read_current_version()
        version = bump_version(current, bump_type_or_version)
        tag = f"v{version}"
        update_version_in_files(version)
        print(f"  🔼 自增类型: {bump_type_or_version}")
    else:
        print(f"❌ 不认识的参数: {bump_type_or_version}，请用 patch/minor/major 或 vx.y.z")
        sys.exit(1)

    print(f"📦 版本: {tag}")

    # ── 2. 构建安装包 ──
    print("\n🔨 步骤1: 构建 Tauri 应用...")
    run(["npm", "run", "tauri", "build"])

    # ── 3. 生成 updater.json ──
    print("\n📝 步骤2: 生成 updater.json...")
    nsis_dir = os.path.join(
        PROJECT_DIR, "src-tauri", "target", "release", "bundle", "nsis"
    )
    installer_name = f"TimerMaster_{version}_x64-setup.exe"
    installer_path = os.path.join(nsis_dir, installer_name)

    if not os.path.exists(installer_path):
        print(f"❌ 安装包未找到: {installer_path}")
        exe_files = [f for f in os.listdir(nsis_dir) if f.endswith(".exe")]
        if exe_files:
            installer_name = exe_files[0]
            installer_path = os.path.join(nsis_dir, installer_name)
            print(f"  改用: {installer_name}")
        else:
            sys.exit(1)

    download_url = (
        f"https://github.com/{REPO}/releases/download/{tag}/{installer_name}"
    )

    updater = {
        "version": version,
        "notes": f"TimerMaster {tag}",
        "pub_date": datetime.now(timezone.utc).isoformat(),
        "platforms": {
            "windows-x86_64": {
                "signature": "",
                "url": download_url,
            }
        },
    }

    updater_path = os.path.join(nsis_dir, "updater.json")
    with open(updater_path, "w") as f:
        json.dump(updater, f, indent=2)

    # 同时保存到项目根目录（供 jsDelivr CDN 加速访问）
    repo_updater_path = os.path.join(PROJECT_DIR, "updater.json")
    with open(repo_updater_path, "w") as f:
        json.dump(updater, f, indent=2)
    print(f"  ✅ updater.json 已生成（CDN 副本）")

    # ── 4. 生成更新日志 ──
    print("\n📝 步骤3: 生成更新日志...")
    release_notes = get_commit_log_since_last_tag()
    print(release_notes[:500])

    # ── 5. 提交版本号修改 + updater.json 到 Git ──
    print(f"\n📝 步骤4: 提交版本文件...")
    subprocess.run(["git", "add", "src-tauri/tauri.conf.json", "src-tauri/Cargo.toml",
                     "updater.json", "src-tauri/Cargo.lock"],
                    cwd=PROJECT_DIR, capture_output=True)
    subprocess.run(
        ["git", "commit", "--allow-empty", "-m", f"chore: bump to {tag}"],
        cwd=PROJECT_DIR, capture_output=True,
    )
    subprocess.run(["git", "push"], cwd=PROJECT_DIR, capture_output=True)

    # ── 6. 打 Git 标签 ──
    print(f"\n🏷️  步骤5: 打标签 {tag}...")
    subprocess.run(["git", "tag", "-d", tag], cwd=PROJECT_DIR, capture_output=True)
    result = run(["git", "tag", tag])

    # ── 7. 推送标签到 GitHub ──
    print(f"\n📤 步骤6: 推送标签到 GitHub...")
    subprocess.run(["git", "push", "--delete", "origin", tag],
                   cwd=PROJECT_DIR, capture_output=True)
    run(["git", "push", "origin", tag])

    # ── 8. 上传到 GitHub Releases ──
    print(f"\n📤 步骤7: 创建 Release 并上传安装包...")
    import requests

    headers = {
        "Authorization": f"Bearer {github_token}",
        "Accept": "application/vnd.github.v3+json",
    }

    # 检查是否已存在同名 Release
    r = requests.get(
        f"https://api.github.com/repos/{REPO}/releases/tags/{tag}",
        headers=headers,
    )
    if r.ok:
        release_id = r.json()["id"]
        print(f"  发现已存在的 Release #{release_id}，删除中...")
        requests.delete(
            f"https://api.github.com/repos/{REPO}/releases/{release_id}",
            headers=headers,
        )

    # 创建 Release
    r = requests.post(
        f"https://api.github.com/repos/{REPO}/releases",
        headers=headers,
        json={
            "tag_name": tag,
            "name": tag,
            "body": release_notes,
            "draft": False,
            "prerelease": False,
        },
    )
    if not r.ok:
        print(f"❌ 创建 Release 失败: {r.status_code} {r.text}")
        sys.exit(1)

    release_data = r.json()
    upload_url = release_data["upload_url"].replace(
        "{?name,label}", ""
    )
    print(f"  ✅ Release 已创建: {release_data['html_url']}")

    # 上传安装包
    print(f"\n📤 上传安装包: {installer_name}")
    with open(installer_path, "rb") as f:
        r = requests.post(
            upload_url,
            headers={**headers, "Content-Type": "application/x-msdownload"},
            params={"name": installer_name},
            data=f,
        )
    if r.ok:
        print(f"  ✅ 安装包上传成功")
    else:
        print(f"  ❌ 上传失败: {r.status_code} {r.text}")

    # 上传 updater.json
    print(f"\n📤 上传 updater.json")
    with open(updater_path, "rb") as f:
        r = requests.post(
            upload_url,
            headers={**headers, "Content-Type": "application/json"},
            params={"name": "updater.json"},
            data=f,
        )
    if r.ok:
        print(f"  ✅ updater.json 上传成功")
    else:
        print(f"  ❌ 上传失败: {r.status_code} {r.text}")

    # ── 完成 ──
    print(f"\n{'='*50}")
    print(f"✅ 全部完成！")
    print(f"   版本: {tag}")
    print(f"   安装包: {installer_path}")
    print(f"   Release: {release_data['html_url']}")
    print(f"{'='*50}")


if __name__ == "__main__":
    main()
