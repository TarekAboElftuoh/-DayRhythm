using System;
using System.Runtime.InteropServices;

namespace DayRhythm
{
    /// <summary>
    /// P/Invoke bridge to the shared C++20 DayRhythmCore.dll library.
    /// </summary>
    internal static class NativeCore
    {
        private const string DllName = "DayRhythmCore.dll";

        [DllImport(DllName, CallingConvention = CallingConvention.Cdecl)]
        private static extern int dr_spirc_encode(
            uint action,
            uint entityKind,
            [MarshalAs(UnmanagedType.LPUTF8Str)] string entityId,
            [MarshalAs(UnmanagedType.LPUTF8Str)] string clientId,
            [MarshalAs(UnmanagedType.LPUTF8Str)] string opId,
            ulong lamportSeq,
            ulong timestampMs,
            byte deleted,
            byte[] payload,
            UIntPtr payloadLen,
            out IntPtr outBuf,
            out UIntPtr outLen
        );

        [DllImport(DllName, CallingConvention = CallingConvention.Cdecl)]
        private static extern void dr_free(IntPtr ptr);

        [DllImport(DllName, CallingConvention = CallingConvention.Cdecl)]
        private static extern int dr_lamport_wins(
            ulong localSeq,
            [MarshalAs(UnmanagedType.LPUTF8Str)] string localClientId,
            ulong incomingSeq,
            [MarshalAs(UnmanagedType.LPUTF8Str)] string incomingClientId
        );

        public static byte[] EncodeSpircFrame(
            uint action,
            uint entityKind,
            string entityId,
            string clientId,
            string opId,
            ulong lamportSeq,
            ulong timestampMs,
            bool deleted,
            byte[] payload
        )
        {
            try
            {
                byte[] safePayload = payload ?? Array.Empty<byte>();
                int rc = dr_spirc_encode(
                    action,
                    entityKind,
                    entityId ?? "",
                    clientId ?? "",
                    opId ?? "",
                    lamportSeq,
                    timestampMs,
                    deleted ? (byte)1 : (byte)0,
                    safePayload,
                    (UIntPtr)safePayload.Length,
                    out IntPtr outPtr,
                    out UIntPtr outLen
                );
                if (rc != 0 || outPtr == IntPtr.Zero) return null;
                try
                {
                    int len = (int)outLen.ToUInt64();
                    byte[] managed = new byte[len];
                    if (len > 0) Marshal.Copy(outPtr, managed, 0, len);
                    return managed;
                }
                finally
                {
                    dr_free(outPtr);
                }
            }
            catch (DllNotFoundException)
            {
                return null; // Managed fallback: DayRhythmCore.dll not bundled
            }
        }

        public static bool LamportWins(ulong localSeq, string localClientId, ulong incomingSeq, string incomingClientId)
        {
            try
            {
                return dr_lamport_wins(localSeq, localClientId ?? "", incomingSeq, incomingClientId ?? "") == 1;
            }
            catch
            {
                if (incomingSeq != localSeq) return incomingSeq > localSeq;
                return string.CompareOrdinal(incomingClientId ?? "", localClientId ?? "") > 0;
            }
        }
    }
}
