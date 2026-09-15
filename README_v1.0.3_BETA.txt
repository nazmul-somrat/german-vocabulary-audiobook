GVA v1.0.3 BETA

Changes:
- Sidebar/current-course language now refreshes immediately without a manual page refresh.
- Added 1.75x and 2x playback speeds.
- Added safer audio playback handling for Android/PWA: play() failures are no longer silently ignored.
- Added retry/reconnect handling for stalled/error/waiting audio streams.
- Auto-next and repeat now use the resilient playback path.
- Media Session play/pause/next/previous handlers use the same resilient playback path.
- Media Session position state is refreshed during playback.
- Foreground return and network-online recovery hooks added.
- User data/localStorage is not cleared or migrated. Progress, bookmarks, quiz scores, and preferences stay intact.

Important limitation:
A PWA is still web content, not a native Android foreground media service. If Android/Chrome fully suspends or kills the PWA while it is paused/backgrounded, a headset Play key cannot wake JavaScript that is no longer running. Battery optimization settings can affect this.
