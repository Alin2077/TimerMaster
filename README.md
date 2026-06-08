# ⏱ TimerMaster

一个基于 **Tauri + React** 构建的桌面定时提醒应用，守护你的健康。

![Tauri](https://img.shields.io/badge/Tauri-2.x-FFC131?logo=tauri)
![Rust](https://img.shields.io/badge/Rust-1.96-000000?logo=rust)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript)

---

## ✨ 功能

- **⏱ 单次定时器** — 设置自定义倒计时，时间到弹出系统通知
- **🔄 重复提醒** — 每 45 分钟提醒起身活动（核心需求，护腰护眼）
- **📋 任务列表** — 查看所有已创建的定时任务，实时显示剩余时间

## 🖼 截图

| 单次定时器 | 重复提醒 | 任务列表 |
|:---:|:---:|:---:|
| 自定义/预设倒计时 | 一键启动45分钟循环 | 实时状态跟踪 |

## 🚀 快速开始

### 前置要求

- [Rust](https://www.rust-lang.org/) (1.70+)
- [Node.js](https://nodejs.org/) (18+)
- 系统需支持 WebView2 (Windows) / WebKitGTK (Linux)

### 安装与运行

```bash
# 1. 克隆仓库
git clone git@github.com:Alin2077/TimerMaster.git
cd TimerMaster

# 2. 安装前端依赖
npm install

# 3. 开发模式运行
npm run tauri dev
```

> 首次运行会自动下载 Rust crate 依赖并编译，请耐心等待。

### 构建发布包

```bash
npm run tauri build
```

构建产物在 `src-tauri/target/release/bundle/` 目录下。

## 🛠 技术栈

| 层级 | 技术 |
|------|------|
| **后端** | Rust + [Tauri 2.x](https://v2.tauri.app) |
| **前端** | React 18 + TypeScript + Vite |
| **异步** | tokio |
| **通知** | tauri-plugin-notification |
| **图标生成** | Tauri icon CLI |

## 📂 项目结构

```
TimerMaster/
├── src/                   # React 前端
│   ├── App.tsx            # 主应用（Tab 切换）
│   ├── components/
│   │   ├── SingleTimer.tsx       # 单次定时器
│   │   ├── RepeatingReminder.tsx # 重复提醒
│   │   └── TaskList.tsx          # 任务列表
│   └── styles/App.css    # 暗色主题样式
├── src-tauri/             # Rust 后端
│   └── src/
│       ├── main.rs        # 入口
│       ├── lib.rs         # Tauri 命令 & 定时逻辑
│       └── timer.rs       # 任务管理器
├── index.html
├── package.json
├── vite.config.ts
└── tsconfig.json
```

## 📄 许可证

MIT
