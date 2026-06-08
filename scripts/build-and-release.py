"""
TimerMaster 一键构建 + 发布脚本
用法: python scripts/build-and-release.py [版本号] [GitHub Token]
  例如: python scripts/build-and-release.py v1.0.0
       python scripts/build-and-release.py v1.1.0 ghp_xxx

如果没有指定版本号，则自动读取 src-tauri/tauri.conf.json 中的版本
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


def get_commit_log_since_last_tag():
    """获取自上一个标签以来的 commit 日志作为更新日志."""
    result = subprocess.run(
        ["git", "log", "--oneline", "--no-decorate"],
        cwd=PROJECT_DIR, capture_output=True, text=True
    )
    lines = result.stdout.strip().split("\n")

    # 找到第一个 tag 之前的所有 commit
    # 或者直接拿最近 50 条
    notes = []
    for line in lines[:50]:
        match = re.match(r'^([a-f0-9]+)\s+(.*)', line)
        if match:
            notes.append(f"- {match.group(2)}")
    return "\n".join(notes)


def main():
    # 从命令行参数或环境变量获取 Token
    github_token = ""
    if len(sys.argv) > 2:
        github_token = sys.argv[2]
    elif os.environ.get("GH_TOKEN"):
        github_token = os.environ["GH_TOKEN"]
    elif os.environ.get("GITHUB_TOKEN"):
        github_token = os.environ["GITHUB_TOKEN"]

    if not github_token:
        print("❌ 需要 GitHub Token：python scripts/build-and-release.py v1.0.0 <你的Token>")
        print("   或设置环境变量 GH_TOKEN")
        sys.exit(1)

    # ── 1. 确定版本号 ──
    if len(sys.argv) > 1:
        tag = sys.argv[1].lstrip("v")
        tag = f"v{tag}"
    else:
        # 从 tauri.conf.json 读取版本
        conf_path = os.path.join(PROJECT_DIR, "src-tauri", "tauri.conf.json")
        with open(conf_path, "r") as f:
            conf = json.load(f)
        tag = f"v{conf['version']}"

    version = tag.lstrip("v")
    print(f"📦 版本: {tag}")

    # ── 2. 构建安装包 ──
    print("\n🔨 步骤1: 安装 npm 依赖...")
    run(["npm", "install"])

    print("\n🔨 步骤2: 构建 Tauri 应用...")
    run(["npm", "run", "tauri", "build"])

    # ── 3. 生成 updater.json ──
    print("\n📝 步骤3: 生成 updater.json...")
    nsis_dir = os.path.join(
        PROJECT_DIR, "src-tauri", "target", "release", "bundle", "nsis"
    )
    installer_name = f"TimerMaster_{version}_x64-setup.exe"
    installer_path = os.path.join(nsis_dir, installer_name)

    if not os.path.exists(installer_path):
        print(f"❌ 安装包未找到: {installer_path}")
        # 尝试查找其他 .exe
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
        "notes": f"TimerMaster {version}",
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
    print(f"  ✅ updater.json 已生成")

    # ── 4. 生成更新日志 ──
    print("\n📝 步骤4: 生成更新日志...")
    release_notes = get_commit_log_since_last_tag()
    print(release_notes[:500])

    # ── 5. 打 Git 标签 ──
    print(f"\n🏷️  步骤5: 打标签 {tag}...")
    # 删除已存在的本地标签
    subprocess.run(["git", "tag", "-d", tag], cwd=PROJECT_DIR,
                   capture_output=True)
    result = run(["git", "tag", tag])

    # ── 6. 推送标签到 GitHub ──
    print(f"\n📤 步骤6: 推送标签到 GitHub...")
    subprocess.run(["git", "push", "--delete", "origin", tag],
                   cwd=PROJECT_DIR, capture_output=True)
    run(["git", "push", "origin", tag])

    # ── 7. 上传到 GitHub Releases ──
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
