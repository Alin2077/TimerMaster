# ⏱ TimerMaster

一个基于 **Tauri + React** 构建的桌面定时提醒应用，守护你的健康。

![Tauri](https://img.shields.io/badge/Tauri-2.x-FFC131?logo=tauri)
![Rust](https://img.shields.io/badge/Rust-1.96-000000?logo=rust)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript)
![SQLite](https://img.shields.io/badge/SQLite-003B57?logo=sqlite)

---

## ✨ 功能

### ⏱ 任务创建

- **⏱ 倒计时** — 设置分钟/秒，到点提醒（支持快捷预设）
- **⏰ 指定时间** — 选未来某个时刻，到点自动触发

### 🔄 重复规则

| 规则 | 说明 |
|------|------|
| 间隔 | 每 N 分钟循环（15/30/45/60/90/120 分钟预设） |
| 每天 | 每天固定时间重复 |
| 工作日 | 周一至周五重复 |
| 每周 | 每周指定某天重复 |
| 每月 | 每月指定号重复 |

### 🎯 计时中

- 实时倒计时大号数字显示
- 剩余 < 10 秒 → 数字变红脉动
- 进度条（绿→黄→红渐变）
- 暂停 / 继续 / 取消 / 确认完成

### 📋 任务管理

- SQLite 持久化存储，重装不丢数据
- 分类标签（工作 / 休息 / 吃药）
- 任务列表按状态排序
- 删除已完成/已取消的任务

### 📊 统计

- 完成率环形图
- 分类统计进度条
- 总任务 / 已完成 / 运行中概览
- 数字滚动入场动画

### ⚙️ 设置

- **开机自启** — 电脑启动时自动运行
- **窗口置顶** — 保持窗口在其他应用之上
- **深色/浅色主题** — 一键切换，自动记住偏好
- **全局快捷键** — `Ctrl + Shift + T` 切换显示/隐藏
- **数据导入/导出** — 导出为 JSON，支持导入分享

### 🔄 自动更新

- 启动后 4 秒后台静默检测
- 发现新版本 → 蓝色按钮提示
- 软件内下载安装包，实时进度条
- 下载完提示安装

### 🛎️ 其他

- 系统托盘后台运行（关闭窗口 = 最小化到托盘）
- 持续提醒模式（重复通知直到手动确认）
- 执行动作：自动关机 / 打开软件 / 运行脚本

---

## 🖼 界面

```
  5 个 Tab 导航
  ┌──────────────────────────────────┐
  │ ➕ 新建  │ 🎯 计时中 │ 📋 列表 │ 📊 统计 │ ⚙️ 设置 │
  └──────────────────────────────────┘
```

### 动效反馈

| 效果 | 位置 |
|------|------|
| Toast 弹入弹出 | 全局操作反馈 |
| 按钮点击微缩 | 所有按钮 |
| 内容淡入 | Tab 切换、卡片打开 |
| 倒计时脉冲 | 剩余 < 10 秒 |
| 完成发光 | 倒计时归零 |
| 分类色条 | 列表页、计时中页 |
| 进度条平滑过渡 | 计时中页 |
| 数字滚动入场 | 统计页 |
| 环形图绘制 | 统计页 |
| Toggle 弹簧回弹 | 设置页 |
| 标题渐变动画 | 顶部标题 |
| Tab 下滑条 | 选中 Tab |

---

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

首次运行会自动下载 Rust crate 依赖并编译，请耐心等待。

### 构建安装包

```bash
npm run tauri build
```

构建产物在 `src-tauri/target/release/bundle/nsis/` 目录。

### 一键发版

```bash
# 设置 GitHub Token
set GH_TOKEN=ghp_xxxx

# 自动检测版本递增类型（patch/minor/major）+ 构建 + 发布
python scripts/build-and-release.py
```

自动检测规则（基于 Conventional Commits）：

| commit 前缀 | 自动版本号 |
|------------|-----------|
| `fix:` | patch (4.13.0 → 4.13.1) |
| `feat:` | minor (4.13.0 → 4.14.0) |
| `BREAKING CHANGE:` | major (4.13.0 → 5.0.0) |

---

## 🛠 技术栈

| 层级 | 技术 |
|------|------|
| **后端** | Rust + Tauri 2.x |
| **前端** | React 18 + TypeScript + Vite |
| **数据库** | SQLite (rusqlite) |
| **异步** | tokio |
| **通知** | tauri-plugin-notification |
| **全局快捷键** | tauri-plugin-global-shortcut |
| **文件选择** | tauri-plugin-dialog |
| **自动启动** | tauri-plugin-autostart |
| **更新** | tauri-plugin-updater |

## 📂 项目结构

```
TimerMaster/
├── src/                       # React 前端
│   ├── App.tsx                # 主应用
│   ├── components/
│   │   ├── CreateTask.tsx     # 统一任务创建（倒计时+指定时间）
│   │   ├── RunningTimers.tsx  # 计时中（实时倒计时+进度条）
│   │   ├── TaskList.tsx       # 任务列表
│   │   ├── Stats.tsx          # 完成统计
│   │   ├── Settings.tsx       # 设置
│   │   └── Toast.tsx          # 全局通知
│   └── styles/App.css         # 样式 + 动效
├── src-tauri/                 # Rust 后端
│   ├── src/
│   │   ├── main.rs            # 入口（防多开）
│   │   ├── lib.rs             # Tauri 命令 + 定时逻辑
│   │   ├── timer.rs           # 任务管理器
│   │   └── database.rs        # SQLite 数据库层
│   ├── icons/                 # 应用图标
│   └── installer-hooks.nsh    # 卸载保留数据
├── scripts/
│   └── build-and-release.py   # 一键发版脚本
└── updater.json               # 自动更新元数据
```

## 📄 许可证

MIT
