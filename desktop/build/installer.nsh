; Custom NSIS hooks for GoveeDMX.
; Automatically open Windows Firewall for the app so Govee LAN discovery
; (UDP 4001-4003) and Art-Net (UDP 6454) inbound traffic can reach it.
; Note: adding firewall rules requires elevation, so run the installer as
; Administrator for these to take effect (otherwise add the rules manually).

!macro customInstall
  nsExec::Exec 'netsh advfirewall firewall delete rule name="GoveeDMX"'
  nsExec::Exec 'netsh advfirewall firewall add rule name="GoveeDMX" dir=in action=allow program="$INSTDIR\GoveeDMX.exe" enable=yes profile=any'
  nsExec::Exec 'netsh advfirewall firewall delete rule name="GoveeDMX UDP"'
  nsExec::Exec 'netsh advfirewall firewall add rule name="GoveeDMX UDP" dir=in action=allow protocol=UDP localport=4001-4003,6454 enable=yes profile=any'
!macroend

!macro customUnInstall
  nsExec::Exec 'netsh advfirewall firewall delete rule name="GoveeDMX"'
  nsExec::Exec 'netsh advfirewall firewall delete rule name="GoveeDMX UDP"'
!macroend
