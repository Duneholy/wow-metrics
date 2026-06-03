Set WshShell = CreateObject("WScript.Shell")
Set objFSO = CreateObject("Scripting.FileSystemObject")
strPath = objFSO.GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = strPath

' Run the beautiful splash screen and server launcher via PowerShell invisibly
WshShell.Run "powershell.exe -ExecutionPolicy Bypass -WindowStyle Hidden -File Launch.ps1", 0, False
