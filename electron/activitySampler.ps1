$ErrorActionPreference = 'SilentlyContinue'

Add-Type -AssemblyName System.Runtime.WindowsRuntime

Add-Type -TypeDefinition @"
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;

public static class FocusGateActivityInterop {
  [StructLayout(LayoutKind.Sequential)]
  public struct LASTINPUTINFO {
    public uint cbSize;
    public uint dwTime;
  }

  [DllImport("user32.dll")]
  public static extern IntPtr GetForegroundWindow();

  [DllImport("user32.dll")]
  public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);

  [DllImport("user32.dll")]
  public static extern bool GetLastInputInfo(ref LASTINPUTINFO plii);
}
"@

Add-Type -TypeDefinition @"
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;

public class FocusGateAudioSessionSnapshot {
  public int pid { get; set; }
  public string name { get; set; }
  public float peak { get; set; }
}

public static class FocusGateAudioInterop {
  private const int CLSCTX_ALL = 23;
  private const int RPC_E_CHANGED_MODE = unchecked((int)0x80010106);

  [DllImport("ole32.dll")]
  private static extern int CoInitializeEx(IntPtr reserved, uint coInit);

  [DllImport("ole32.dll")]
  private static extern void CoUninitialize();

  public static FocusGateAudioSessionSnapshot[] GetActiveRenderSessions(float minimumPeak) {
    bool shouldUninitialize = false;
    int initHr = CoInitializeEx(IntPtr.Zero, 0);
    if (initHr >= 0) {
      shouldUninitialize = true;
    } else if (initHr != RPC_E_CHANGED_MODE) {
      return Array.Empty<FocusGateAudioSessionSnapshot>();
    }

    IMMDeviceEnumerator enumerator = null;
    IMMDevice device = null;
    IAudioSessionManager2 sessionManager = null;
    IAudioSessionEnumerator sessionEnumerator = null;

    try {
      enumerator = (IMMDeviceEnumerator)new MMDeviceEnumeratorComObject();
      Marshal.ThrowExceptionForHR(enumerator.GetDefaultAudioEndpoint(EDataFlow.eRender, ERole.eMultimedia, out device));

      Guid sessionManagerGuid = typeof(IAudioSessionManager2).GUID;
      object sessionManagerObject;
      Marshal.ThrowExceptionForHR(device.Activate(ref sessionManagerGuid, CLSCTX_ALL, IntPtr.Zero, out sessionManagerObject));
      sessionManager = (IAudioSessionManager2)sessionManagerObject;

      Marshal.ThrowExceptionForHR(sessionManager.GetSessionEnumerator(out sessionEnumerator));

      int count;
      Marshal.ThrowExceptionForHR(sessionEnumerator.GetCount(out count));

      var seenProcessIds = new HashSet<int>();
      var snapshots = new List<FocusGateAudioSessionSnapshot>();

      for (int index = 0; index < count; index++) {
        IAudioSessionControl sessionControl = null;

        try {
          Marshal.ThrowExceptionForHR(sessionEnumerator.GetSession(index, out sessionControl));
          if (sessionControl == null) {
            continue;
          }

          int state;
          Marshal.ThrowExceptionForHR(sessionControl.GetState(out state));
          if (state != (int)AudioSessionState.Active) {
            continue;
          }

          var sessionControl2 = sessionControl as IAudioSessionControl2;
          var meterInformation = sessionControl as IAudioMeterInformation;
          if (sessionControl2 == null || meterInformation == null) {
            continue;
          }

          uint processIdValue;
          Marshal.ThrowExceptionForHR(sessionControl2.GetProcessId(out processIdValue));
          if (processIdValue == 0 || processIdValue > int.MaxValue) {
            continue;
          }

          float peakValue;
          Marshal.ThrowExceptionForHR(meterInformation.GetPeakValue(out peakValue));
          if (peakValue < minimumPeak) {
            continue;
          }

          int processId = (int)processIdValue;
          if (!seenProcessIds.Add(processId)) {
            continue;
          }

          string processName;
          try {
            processName = Process.GetProcessById(processId).ProcessName;
          } catch {
            continue;
          }

          if (string.IsNullOrWhiteSpace(processName)) {
            continue;
          }

          snapshots.Add(new FocusGateAudioSessionSnapshot {
            pid = processId,
            name = processName,
            peak = peakValue
          });
        } catch {
          continue;
        } finally {
          if (sessionControl != null) {
            Marshal.ReleaseComObject(sessionControl);
          }
        }
      }

      return snapshots.ToArray();
    } catch {
      return Array.Empty<FocusGateAudioSessionSnapshot>();
    } finally {
      if (sessionEnumerator != null) Marshal.ReleaseComObject(sessionEnumerator);
      if (sessionManager != null) Marshal.ReleaseComObject(sessionManager);
      if (device != null) Marshal.ReleaseComObject(device);
      if (enumerator != null) Marshal.ReleaseComObject(enumerator);
      if (shouldUninitialize) CoUninitialize();
    }
  }

  private enum AudioSessionState {
    Inactive = 0,
    Active = 1,
    Expired = 2
  }

  private enum EDataFlow {
    eRender = 0,
    eCapture = 1,
    eAll = 2
  }

  private enum ERole {
    eConsole = 0,
    eMultimedia = 1,
    eCommunications = 2
  }

  [ComImport]
  [Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
  private class MMDeviceEnumeratorComObject {
  }

  [ComImport]
  [Guid("A95664D2-9614-4F35-A746-DE8DB63617E6")]
  [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  private interface IMMDeviceEnumerator {
    int EnumAudioEndpoints(EDataFlow dataFlow, uint stateMask, out object devices);
    int GetDefaultAudioEndpoint(EDataFlow dataFlow, ERole role, out IMMDevice endpoint);
    int GetDevice([MarshalAs(UnmanagedType.LPWStr)] string id, out IMMDevice device);
    int RegisterEndpointNotificationCallback(IntPtr client);
    int UnregisterEndpointNotificationCallback(IntPtr client);
  }

  [ComImport]
  [Guid("D666063F-1587-4E43-81F1-B948E807363F")]
  [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  private interface IMMDevice {
    int Activate(
      ref Guid iid,
      int clsCtx,
      IntPtr activationParams,
      [MarshalAs(UnmanagedType.IUnknown)] out object interfacePointer
    );
    int OpenPropertyStore(int stgmAccess, out IntPtr properties);
    int GetId([MarshalAs(UnmanagedType.LPWStr)] out string id);
    int GetState(out int state);
  }

  [ComImport]
  [Guid("BFA971F1-4D5E-40BB-935E-967039BFBEE4")]
  [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  private interface IAudioSessionManager2 {
    int GetAudioSessionControl(ref Guid audioSessionGuid, uint streamFlags, out IntPtr sessionControl);
    int GetSimpleAudioVolume(ref Guid audioSessionGuid, uint streamFlags, out IntPtr audioVolume);
    int GetSessionEnumerator(out IAudioSessionEnumerator sessionEnum);
    int RegisterSessionNotification(IntPtr sessionNotification);
    int UnregisterSessionNotification(IntPtr sessionNotification);
    int RegisterDuckNotification([MarshalAs(UnmanagedType.LPWStr)] string sessionId, IntPtr duckNotification);
    int UnregisterDuckNotification(IntPtr duckNotification);
  }

  [ComImport]
  [Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8")]
  [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  private interface IAudioSessionEnumerator {
    int GetCount(out int sessionCount);
    int GetSession(int sessionCount, out IAudioSessionControl session);
  }

  [ComImport]
  [Guid("F4B1A599-7266-4319-A8CA-E70ACB11E8CD")]
  [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  private interface IAudioSessionControl {
    int GetState(out int state);
    int GetDisplayName([MarshalAs(UnmanagedType.LPWStr)] out string value);
    int SetDisplayName([MarshalAs(UnmanagedType.LPWStr)] string value, ref Guid eventContext);
    int GetIconPath([MarshalAs(UnmanagedType.LPWStr)] out string value);
    int SetIconPath([MarshalAs(UnmanagedType.LPWStr)] string value, ref Guid eventContext);
    int GetGroupingParam(out Guid groupingId);
    int SetGroupingParam(ref Guid groupingId, ref Guid eventContext);
    int RegisterAudioSessionNotification(IntPtr client);
    int UnregisterAudioSessionNotification(IntPtr client);
  }

  [ComImport]
  [Guid("bfb7ff88-7239-4fc9-8fa2-07c950be9c6d")]
  [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  private interface IAudioSessionControl2 {
    int GetState(out int state);
    int GetDisplayName([MarshalAs(UnmanagedType.LPWStr)] out string value);
    int SetDisplayName([MarshalAs(UnmanagedType.LPWStr)] string value, ref Guid eventContext);
    int GetIconPath([MarshalAs(UnmanagedType.LPWStr)] out string value);
    int SetIconPath([MarshalAs(UnmanagedType.LPWStr)] string value, ref Guid eventContext);
    int GetGroupingParam(out Guid groupingId);
    int SetGroupingParam(ref Guid groupingId, ref Guid eventContext);
    int RegisterAudioSessionNotification(IntPtr client);
    int UnregisterAudioSessionNotification(IntPtr client);
    int GetSessionIdentifier([MarshalAs(UnmanagedType.LPWStr)] out string value);
    int GetSessionInstanceIdentifier([MarshalAs(UnmanagedType.LPWStr)] out string value);
    int GetProcessId(out uint processId);
    int IsSystemSoundsSession();
    int SetDuckingPreference(bool optOut);
  }

  [ComImport]
  [Guid("C02216F6-8C67-4B5B-9D00-D008E73E0064")]
  [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  private interface IAudioMeterInformation {
    int GetPeakValue(out float peak);
    int GetMeteringChannelCount(out int channelCount);
    int GetChannelsPeakValues(int channelCount, [Out, MarshalAs(UnmanagedType.LPArray, SizeParamIndex = 0)] float[] peakValues);
    int QueryHardwareSupport(out int hardwareSupportMask);
  }
}
"@

function Convert-WinRtOperationToTask {
  param(
    [Parameter(Mandatory = $true)]
    $Operation,
    [Parameter(Mandatory = $true)]
    [Type]$ResultType
  )

  $method = [System.WindowsRuntimeSystemExtensions].GetMethods() |
    Where-Object { $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 } |
    Select-Object -First 1

  if (-not $method) {
    throw 'AsTask helper not found.'
  }

  $generic = $method.MakeGenericMethod($ResultType)
  return $generic.Invoke($null, @($Operation))
}

function Get-IdleMilliseconds {
  $info = New-Object FocusGateActivityInterop+LASTINPUTINFO
  $info.cbSize = [System.Runtime.InteropServices.Marshal]::SizeOf($info)

  if (-not [FocusGateActivityInterop]::GetLastInputInfo([ref]$info)) {
    return 0
  }

  $tickNow = [Environment]::TickCount64
  $lastInputTick = [uint64]$info.dwTime
  $delta = $tickNow - $lastInputTick
  if ($delta -lt 0) {
    return 0
  }

  return [int64]$delta
}

function Normalize-ExeName {
  param([string]$Name)

  $trimmed = $Name.Trim().ToLowerInvariant()
  if ([string]::IsNullOrWhiteSpace($trimmed)) {
    return ''
  }

  if ($trimmed.EndsWith('.exe')) {
    return $trimmed
  }

  return "$trimmed.exe"
}

function Resolve-MediaAppName {
  param($Session)

  $sourceId = [string]$Session.SourceAppUserModelId
  if ([string]::IsNullOrWhiteSpace($sourceId)) {
    return ''
  }

  if ($sourceId -match '\\([^\\]+)\.exe$') {
    return Normalize-ExeName $matches[1]
  }

  if ($sourceId.Contains('!')) {
    $tail = $sourceId.Split('!')[-1]
    if (-not [string]::IsNullOrWhiteSpace($tail)) {
      return Normalize-ExeName $tail
    }
  }

  $base = $sourceId.Split('_')[0]
  $parts = $base.Split('.')
  $candidate = $parts[-1]
  if (-not [string]::IsNullOrWhiteSpace($candidate)) {
    return Normalize-ExeName $candidate
  }

  return ''
}

function Get-AudioSessionApps {
  try {
    return [FocusGateAudioInterop]::GetActiveRenderSessions(0.001) |
      ForEach-Object {
        if ([string]::IsNullOrWhiteSpace($_.name)) {
          return
        }

        @{
          pid = [int]$_.pid
          name = Normalize-ExeName $_.name
        }
      } |
      Where-Object { $_ -and -not [string]::IsNullOrWhiteSpace($_.name) } |
      Group-Object name |
      ForEach-Object { $_.Group[0] }
  } catch {
    return @()
  }
}

function Get-MediaSessionApps {
  $apps = @()

  try {
    $null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType=WindowsRuntime]
    $request = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()
    $task = Convert-WinRtOperationToTask -Operation $request -ResultType ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
    $task.Wait(1500) | Out-Null

    if (-not $task.IsCompletedSuccessfully) {
      return @()
    }

    foreach ($session in $task.Result.GetSessions()) {
      try {
        $playbackInfo = $session.GetPlaybackInfo()
        if (-not $playbackInfo) {
          continue
        }

        if ($playbackInfo.PlaybackStatus.ToString() -ne 'Playing') {
          continue
        }

        $name = Resolve-MediaAppName $session
        if ([string]::IsNullOrWhiteSpace($name)) {
          continue
        }

        $apps += @{
          pid = 0
          name = $name
        }
      } catch {
        continue
      }
    }
  } catch {
      return @()
  }

  if ($apps.Count -eq 0) {
    return @()
  }

  return $apps | Group-Object name | ForEach-Object { $_.Group[0] }
}

function Get-MediaApps {
  $apps = @()
  $apps += @(Get-AudioSessionApps)
  $apps += @(Get-MediaSessionApps)

  if ($apps.Count -eq 0) {
    return @()
  }

  return $apps |
    Where-Object { $_ -and -not [string]::IsNullOrWhiteSpace($_.name) } |
    Group-Object name |
    ForEach-Object { $_.Group[0] }
}

while ($true) {
  try {
    $foreground = $null
    $hwnd = [FocusGateActivityInterop]::GetForegroundWindow()
    if ($hwnd -ne [IntPtr]::Zero) {
      $foregroundPid = 0
      [FocusGateActivityInterop]::GetWindowThreadProcessId($hwnd, [ref]$foregroundPid) | Out-Null
      if ($foregroundPid) {
        $process = Get-Process -Id $foregroundPid -ErrorAction Stop
        $foreground = @{
          pid = [int]$foregroundPid
          name = Normalize-ExeName $process.ProcessName
        }
      }
    }

    $sample = @{
      timestamp = [DateTime]::UtcNow.ToString('o')
      foreground = $foreground
      idleMs = Get-IdleMilliseconds
      mediaApps = @(Get-MediaApps)
    }

    $sample | ConvertTo-Json -Compress -Depth 5
  } catch {
    # Ignore transient sampling failures.
  }

  Start-Sleep -Seconds 2
}
