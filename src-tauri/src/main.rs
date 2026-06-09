// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // 防止多开：尝试绑定本地端口作为锁
    // 如果端口已被占用，说明已有实例在运行
    if let Ok(listener) = std::net::TcpListener::bind("127.0.0.1:45678") {
        // 端口绑定成功，这是第一个实例
        // 设置 SO_REUSEADDR 以便下次快速重启
        let _ = listener.set_nonblocking(true);
        // 保持 listener 存活直到程序退出
        std::mem::forget(listener);
        timer_master_lib::run()
    } else {
        // 端口已被占用，已有实例在运行
        eprintln!("TimerMaster is already running.");
    }
}
