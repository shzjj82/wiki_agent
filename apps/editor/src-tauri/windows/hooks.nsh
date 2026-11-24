; 更新时主程序还占着 exe，NSIS 会弹出「中止 / 重试 / 忽略」。
; 复制文件前先结束旧进程和本机服务，装完由安装器自己重新打开。

!macro NSIS_HOOK_PREINSTALL
  nsExec::Exec 'taskkill /F /IM wiki-agent.exe'
  nsExec::Exec 'taskkill /F /IM wiki-agent-service.exe'
  Sleep 400
  nsExec::Exec 'taskkill /F /IM wiki-agent.exe'
  nsExec::Exec 'taskkill /F /IM wiki-agent-service.exe'
  Sleep 800
!macroend

!macro NSIS_HOOK_POSTINSTALL
!macroend

!macro NSIS_HOOK_PREUNINSTALL
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
!macroend
