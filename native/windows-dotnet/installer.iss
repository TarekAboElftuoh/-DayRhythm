#ifndef AppVersion
  #define AppVersion "1.0.0"
#endif

[Setup]
AppId={{8F2A91B4-4E1D-4C2B-9A3E-71B9D20F5E41}
AppName=DayRhythm
AppVersion={#AppVersion}
AppPublisher=DayRhythm
DefaultDirName={localappdata}\Programs\DayRhythm
DefaultGroupName=DayRhythm
OutputDir=installer-out
OutputBaseFilename=DayRhythm-Setup
SetupIconFile=app.ico
Compression=lzma2
SolidCompression=yes
PrivilegesRequired=lowest
WizardStyle=modern
DisableProgramGroupPage=yes
CloseApplications=force
RestartApplications=no

[Tasks]
Name: "desktopicon"; Description: "Create a Desktop shortcut"; GroupDescription: "Shortcuts:"
Name: "autostart"; Description: "Run DayRhythm automatically with Windows (24/7 Tray)"; GroupDescription: "Background:"

[Files]
Source: "publish-out\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\DayRhythm"; Filename: "{app}\DayRhythm.exe"; IconFilename: "{app}\app.ico"
Name: "{autodesktop}\DayRhythm"; Filename: "{app}\DayRhythm.exe"; IconFilename: "{app}\app.ico"; Tasks: desktopicon

[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "DayRhythm"; ValueData: """{app}\DayRhythm.exe"" --background"; Flags: uninsdeletevalue; Tasks: autostart

[Run]
Filename: "{app}\DayRhythm.exe"; Description: "Launch DayRhythm"; Flags: nowait postinstall skipifsilent
