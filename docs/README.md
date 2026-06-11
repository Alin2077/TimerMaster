# TimerMaster 自动更新

TimerMaster 使用 GitHub Pages 作为更新检查的稳定端点。

## 目录结构

```
docs/
  └── updater.json    ← GitHub Pages 自动发布
```

## 更新 URL

```
https://alin2077.github.io/TimerMaster/updater.json
```

## 发布流程

每次构建时，脚本会：
1. 生成 `updater.json` 
2. 复制到 `docs/` 目录
3. 提交到 GitHub
4. GitHub Pages 自动部署

## updater.json 格式

```json
{
  "version": "4.15.1",
  "notes": "TimerMaster v4.15.1",
  "pub_date": "2026-06-09T00:00:00Z",
  "platforms": {
    "windows-x86_64": {
      "signature": "",
      "url": "https://github.com/Alin2077/TimerMaster/releases/download/v4.15.1/TimerMaster_4.15.1_x64-setup.exe"
    }
  }
}
```
