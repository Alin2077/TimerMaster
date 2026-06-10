; 自定义 NSIS 卸载钩子：保留用户数据
!macro customUnInstall
  ; 跳过删除 AppData 中的数据文件
  SetRegView 64
  DeleteRegKey HKCU "Software\TimerMaster"
  SetRegView 32
  DeleteRegKey HKCU "Software\TimerMaster"
  ; 不删除 AppData 目录，保留数据库
!macroend
