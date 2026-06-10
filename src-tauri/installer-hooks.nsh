; TimerMaster NSIS 卸载钩子
; 保留用户数据（SQLite 数据库）不被卸载器删除

!macro customUnInstall
  ; 不删除 %APPDATA%\com.timermaster.desktop\
  ; 用户数据（tasks.db）由下次启动时自动复用
!macroend
