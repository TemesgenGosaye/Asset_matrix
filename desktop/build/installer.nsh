; ---------------------------------------------------------------------------
; Msf HomeDesk – NSIS branding and shortcut options
; Developed by Temesgen G. | IT Department, Metahara Sugar Factory
; ---------------------------------------------------------------------------

!include "MUI2.nsh"

!ifndef BUILD_UNINSTALLER
Var msfShortcutDesktop
Var msfShortcutStartMenu
Var msfShortcutDialog
Var msfDesktopCheckbox
Var msfStartMenuCheckbox
!endif

!macro customHeader
  BrandingText "Metahara Sugar Factory  |  Developed by Temesgen G."
!macroend

!macro customInit
  StrCpy $msfShortcutDesktop "1"
  StrCpy $msfShortcutStartMenu "1"
!macroend

!macro customWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "Welcome to Msf HomeDesk Setup"
  !define MUI_WELCOMEPAGE_TEXT "This wizard will install Msf HomeDesk on your computer.$\r$\n$\r$\nMsf HomeDesk is a secure desktop application that opens the portal at https://house.taild2df63.ts.net.$\r$\n$\r$\nPublisher: Temesgen G.$\r$\nMetahara Sugar Factory - IT Department$\r$\n$\r$\nClick Next to continue."
  !insertmacro MUI_PAGE_WELCOME
!macroend

!macro customPageAfterChangeDir
  Page custom MSFShortcutPageCreate MSFShortcutPageLeave
!macroend

!ifndef BUILD_UNINSTALLER
Function MSFShortcutPageCreate
  !insertmacro MUI_HEADER_TEXT "Shortcut Options" "Choose which shortcuts Setup should create."

  nsDialogs::Create 1018
  Pop $msfShortcutDialog

  ${If} $msfShortcutDialog == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0 100% 26u "Create shortcuts for Msf HomeDesk. You can change these later by running Setup again."
  Pop $0

  ${NSD_CreateCheckbox} 0 36u 100% 12u "Create a &desktop shortcut"
  Pop $msfDesktopCheckbox

  ${NSD_CreateCheckbox} 0 56u 100% 12u "Create a &Start Menu shortcut"
  Pop $msfStartMenuCheckbox

  ${NSD_CreateLabel} 0 88u 100% 38u "Publisher: Temesgen G.$\r$\nMetahara Sugar Factory - IT Department"
  Pop $0

  ; Preserve the user's existing shortcut choice during an upgrade.
  StrCpy $0 "1"
  ReadRegStr $1 SHELL_CONTEXT "Software\${APP_GUID}" InstallLocation
  ${If} $1 != ""
    ${IfNot} ${FileExists} "$DESKTOP\${SHORTCUT_NAME}.lnk"
      StrCpy $0 "0"
    ${EndIf}
  ${EndIf}
  ${NSD_SetState} $msfDesktopCheckbox $0

  StrCpy $0 "1"
  !ifdef MENU_FILENAME
    StrCpy $2 "$SMPROGRAMS\${MENU_FILENAME}\${SHORTCUT_NAME}.lnk"
  !else
    StrCpy $2 "$SMPROGRAMS\${SHORTCUT_NAME}.lnk"
  !endif
  ${If} $1 != ""
    ${IfNot} ${FileExists} "$2"
      StrCpy $0 "0"
    ${EndIf}
  ${EndIf}
  ${NSD_SetState} $msfStartMenuCheckbox $0

  nsDialogs::Show
FunctionEnd

Function MSFShortcutPageLeave
  ${NSD_GetState} $msfDesktopCheckbox $0
  StrCpy $msfShortcutDesktop $0

  ${NSD_GetState} $msfStartMenuCheckbox $0
  StrCpy $msfShortcutStartMenu $0
FunctionEnd
!endif

!macro customInstall
  ; The installer publisher shown in Apps & features is the developer.
  WriteRegStr SHELL_CONTEXT "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}" "Publisher" "Temesgen G."

  ${If} $msfShortcutDesktop == "1"
    ${IfNot} ${FileExists} "$newDesktopLink"
      CreateShortCut "$newDesktopLink" "$appExe" "" "$appExe" 0 "" "" "${APP_DESCRIPTION}"
      ClearErrors
      WinShell::SetLnkAUMI "$newDesktopLink" "${APP_ID}"
    ${EndIf}
  ${Else}
    WinShell::UninstShortcut "$newDesktopLink"
    Delete "$newDesktopLink"
  ${EndIf}

  ${If} $msfShortcutStartMenu == "1"
    !ifdef MENU_FILENAME
      CreateDirectory "$SMPROGRAMS\${MENU_FILENAME}"
    !endif
    ${IfNot} ${FileExists} "$newStartMenuLink"
      CreateShortCut "$newStartMenuLink" "$appExe" "" "$appExe" 0 "" "" "${APP_DESCRIPTION}"
      ClearErrors
      WinShell::SetLnkAUMI "$newStartMenuLink" "${APP_ID}"
    ${EndIf}
  ${Else}
    WinShell::UninstShortcut "$newStartMenuLink"
    Delete "$newStartMenuLink"
    !ifdef MENU_FILENAME
      RMDir "$SMPROGRAMS\${MENU_FILENAME}"
    !endif
  ${EndIf}

  ; The finish page must be able to launch the app even if no Start Menu
  ; shortcut was requested.
  StrCpy $launchLink "$appExe"
!macroend

!macro customFinishPage
  Function MSFStartApp
    ${if} ${isUpdated}
      StrCpy $1 "--updated"
    ${else}
      StrCpy $1 ""
    ${endif}
    ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" "$1"
  FunctionEnd

  !define MUI_FINISHPAGE_TITLE "Setup complete"
  !define MUI_FINISHPAGE_TEXT "Msf HomeDesk has been installed successfully.$\r$\n$\r$\nPublisher: Temesgen G.$\r$\nMetahara Sugar Factory - IT Department$\r$\n$\r$\nThank you for using Msf HomeDesk. Wishing you a productive and smooth experience."
  !define MUI_FINISHPAGE_RUN
  !define MUI_FINISHPAGE_RUN_TEXT "Launch Msf HomeDesk"
  !define MUI_FINISHPAGE_RUN_FUNCTION "MSFStartApp"
  !insertmacro MUI_PAGE_FINISH
!macroend

!macro customUnWelcomePage
  !define MUI_UNWELCOMEPAGE_TITLE "Uninstall Msf HomeDesk"
  !define MUI_UNWELCOMEPAGE_TEXT "This wizard will remove Msf HomeDesk from your computer.$\r$\n$\r$\nPublisher: Temesgen G.$\r$\nMetahara Sugar Factory - IT Department$\r$\n$\r$\nClick Next to continue."
  !insertmacro MUI_UNPAGE_WELCOME
!macroend
