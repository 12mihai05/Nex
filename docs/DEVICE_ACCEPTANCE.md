# Native notification acceptance (still required)

The extended quality run found no Android SDK or connected Android/iOS device. Only Windows and browsers were discoverable. Plugin-channel tests are not proof of delivery; no physical notification is claimed.

When an Android phone and SDK are available:

1. Install a private development build pointing to the intended HTTPS backend. Sign in and choose the correct country.
2. Choose an EPG programme starting soon; schedule at start or five minutes before. Grant notification and exact-alarm permissions only when prompted by that explicit action.
3. Background/close the app and verify one notification appears at the intended instant with Nex's icon and the correct programme title. Compare device local time with the stored UTC instant.
4. Reopen and edit the offset; verify the existing notification is replaced, not duplicated. Cancel from Browse and Chat and confirm no notification fires.
5. Create another reminder, terminate/restart the app, then sign out or disable reminders. Verify pending OS notifications are cancelled even when no reminder was scheduled in that new process.
6. Deny notification permission and, separately, exact-alarm permission. Verify no success claim and that a failed schedule restores/removes its backend record correctly.
7. Test a past occurrence, reboot recovery, timezone change, and long programme title. Repeat on iOS when macOS/Xcode and a device are available.

Current tests cover the scheduling/cancellation method-channel boundary, stable IDs, UTC-offset calculation, permission denial, initialization failure and invalid offsets. A monochrome Android small-notification icon is included. Reminder reconciliation after upstream EPG changes and across devices remains a separate limitation; signing in does not automatically reschedule old reminders.
