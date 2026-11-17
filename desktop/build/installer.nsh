; ---------------------------------------------------------------------------
; Msf HomeDesk - Professional NSIS installer experience
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

; ---------------------------------------------------------------------------
; Global branding
; ---------------------------------------------------------------------------
!macro customHeader
  BrandingText "Metahara Sugar Factory  |  Msf HomeDesk ${VERSION}  |  Developed by Temesgen G."
!macroend

!macro customInit
  StrCpy $msfShortcutDesktop "1"
  StrCpy $msfShortcutStartMenu "1"
!macroend

; ---------------------------------------------------------------------------
; Welcome page
; ---------------------------------------------------------------------------
!macro customWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "Welcome to Msf HomeDesk Setup"
  !define MUI_WELCOMEPAGE_TEXT "This wizard will install Msf HomeDesk ${VERSION} on your computer.$\r$\n$\r$\nMsf HomeDesk is the secure Windows desktop client for the Metahara Sugar Factory House Administration Portal.$\r$\n$\r$\nPublisher: Temesgen G.$\r$\nMetahara Sugar Factory - IT Department$\r$\n$\r$\nClick Next to continue."
  !insertmacro MUI_PAGE_WELCOME
!macroend

; ---------------------------------------------------------------------------
; Installation options page (after the install location page)
; ---------------------------------------------------------------------------
!macro customPageAfterChangeDir
  Page custom MSFShortcutPageCreate MSFShortcutPageLeave
!macroend

!ifndef BUILD_UNINSTALLER
Function MSFShortcutPageCreate
  !insertmacro MUI_HEADER_TEXT "Installation options" "Review your installation and choose which shortcuts Setup should create."

  nsDialogs::Create 1018
  Pop $msfShortcutDialog

  ${If} $msfShortcutDialog == error
    Abort
  ${EndIf}

  ; --- Installation summary -------------------------------------------------
  ${NSD_CreateGroupBox} 0 0 100% 74u "Installation summary"
  Pop $0

  ${NSD_CreateLabel} 10u 15u 88% 11u "Version: ${VERSION}"
  Pop $0

  ${NSD_CreateLabel} 10u 28u 88% 11u "Install location: $INSTDIR"
  Pop $0

  ${NSD_CreateLabel} 10u 41u 88% 11u "Publisher: Metahara Sugar Factory - IT Department"
  Pop $0

  ${NSD_CreateLabel} 10u 54u 88% 11u "License: Accepted"
  Pop $0

  ; --- Shortcut choices -----------------------------------------------------
  ${NSD_CreateLabel} 0 86u 100% 12u "Create shortcuts for Msf HomeDesk. You can change these later by running Setup again."
  Pop $0

  ${NSD_CreateCheckbox} 0 104u 100% 12u "Create a &desktop shortcut"
  Pop $msfDesktopCheckbox

  ${NSD_CreateCheckbox} 0 122u 100% 12u "Create a &Start Menu shortcut"
  Pop $msfStartMenuCheckbox

  ${NSD_CreateLabel} 0 148u 100% 28u "Publisher: Temesgen G.$\r$\nMetahara Sugar Factory - IT Department"
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

; ---------------------------------------------------------------------------
; Install
; ---------------------------------------------------------------------------
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

; ---------------------------------------------------------------------------
; Finish page
; ---------------------------------------------------------------------------
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
  !define MUI_FINISHPAGE_TEXT "Msf HomeDesk ${VERSION} has been installed successfully.$\r$\n$\r$\nPublisher: Temesgen G.$\r$\nMetahara Sugar Factory - IT Department$\r$\n$\r$\nThank you for choosing Msf HomeDesk. Wishing you a productive and smooth experience.$\r$\n$\r$\nClick Finish to close Setup."
  !define MUI_FINISHPAGE_RUN
  !define MUI_FINISHPAGE_RUN_TEXT "Launch Msf HomeDesk"
  !define MUI_FINISHPAGE_RUN_FUNCTION "MSFStartApp"
  !insertmacro MUI_PAGE_FINISH
!macroend

; ---------------------------------------------------------------------------
; Uninstall welcome page
; ---------------------------------------------------------------------------
!macro customUnWelcomePage
  !define MUI_UNWELCOMEPAGE_TITLE "Uninstall Msf HomeDesk"
  !define MUI_UNWELCOMEPAGE_TEXT "This wizard will remove Msf HomeDesk from your computer.$\r$\n$\r$\nPortal data is stored on the factory server and will not be affected. Local window settings, caches, and diagnostic logs will be removed.$\r$\n$\r$\nPublisher: Temesgen G.$\r$\nMetahara Sugar Factory - IT Department$\r$\n$\r$\nClick Next to continue."
  !insertmacro MUI_UNPAGE_WELCOME
!macroend
