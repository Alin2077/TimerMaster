"""Sign the installer and generate updater.json for Tauri auto-updates."""
import os
import subprocess
import json
import sys
from datetime import datetime, timezone


def main():
    tag_name = os.environ.get("TAG_NAME", "")
    version = tag_name.lstrip("v")
    private_key = os.environ.get("TAURI_SIGNING_PRIVATE_KEY", "")
    key_password = os.environ.get("TAURI_SIGNING_PRIVATE_KEY_PASSWORD", "")
    workspace = os.environ.get("GITHUB_WORKSPACE", ".")

    nsis_dir = os.path.join(
        workspace, "src-tauri", "target", "release", "bundle", "nsis"
    )
    installer_name = f"TimerMaster_{version}_x64-setup.exe"
    installer_path = os.path.join(nsis_dir, installer_name)

    # Write private key to temp file
    runner_temp = os.environ.get("RUNNER_TEMP", "/tmp")
    key_path = os.path.join(runner_temp, "privatekey.pem")
    with open(key_path, "w") as f:
        f.write(private_key)

    print(f"Installer: {installer_path}")

    # Sign using tauri signer
    if private_key:
        result = subprocess.run(
            [
                "npx", "tauri", "signer", "sign",
                "-k", key_path,
                "-p", key_password if key_password else "",
                installer_path,
            ],
            capture_output=True,
            text=True,
            cwd=workspace,
        )
        if result.returncode != 0:
            print(f"Sign error: {result.stderr}", file=sys.stderr)
            # Don't exit - we can still generate updater.json without signature
        else:
            print(result.stdout)
    else:
        print("No private key provided, skipping signature")

    # Find signature file
    signature = ""
    if os.path.isdir(nsis_dir):
        sig_files = [f for f in os.listdir(nsis_dir) if f.endswith(".sig")]
        if sig_files:
            sig_path = os.path.join(nsis_dir, sig_files[0])
            with open(sig_path, "r") as f:
                signature = f.read().strip()
            print(f"Found signature: {sig_files[0]}")
        else:
            print("No .sig file found")
    else:
        print(f"NSIS directory not found: {nsis_dir}")

    download_url = (
        f"https://github.com/Alin2077/TimerMaster/releases/download/"
        f"{tag_name}/{installer_name}"
    )

    updater = {
        "version": version,
        "notes": f"TimerMaster {version}",
        "pub_date": datetime.now(timezone.utc).isoformat(),
        "platforms": {
            "windows-x86_64": {
                "signature": signature,
                "url": download_url,
            }
        },
    }

    updater_path = os.path.join(nsis_dir, "updater.json")
    with open(updater_path, "w") as f:
        json.dump(updater, f, indent=2)

    print(f"✅ updater.json generated with signature: {signature[:40] if signature else '(empty)'}")


if __name__ == "__main__":
    main()
