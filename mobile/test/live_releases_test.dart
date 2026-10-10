import 'dart:io';
import 'dart:math';

import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:nex/src/data/api_client.dart';

import 'live_backend_test.dart' show LiveHttpBinding;

void main() {
  LiveHttpBinding();
  test(
    'real Flutter client release and programme lifecycle on disposable account',
    () async {
      FlutterSecureStorage.setMockInitialValues({});
      final api = NexApiClient();
      final random = Random.secure();
      final nonce = List.generate(
        24,
        (_) => random.nextInt(256).toRadixString(16).padLeft(2, '0'),
      ).join();
      final email = 'release-flutter-$nonce@example.test';
      final password = '${nonce}Aa!';
      var created = false;
      var stage = 'signup';
      try {
        await api.signUp(
          name: 'Disposable release QA',
          email: email,
          password: password,
          inviteCode: Platform.environment['NEX_LIVE_INVITE']!,
        );
        created = true;
        stage = 'login';
        await api.signOut();
        await api.signIn(email: email, password: password);
        await api.saveSettings({'country': 'RO'});
        stage = 'upcoming and search';
        final upcoming = await api.upcoming(1);
        expect(upcoming['meta']['country'], 'RO');
        final movies = await api.search('Avangers Doomsday');
        final title = movies.firstWhere((m) => m.id == 1003596);
        stage = 'release subscription';
        await api.setReleaseFollow(title, 'cinema', true);
        final details = await api.object('/api/title/movie/1003596/releases');
        expect(
          (details['subscriptions'] as List).any(
            (s) => s['kind'] == 'cinema' && s['enabled'] == true,
          ),
          isTrue,
        );
        await api.setReleaseFollow(title, 'cinema', false);
        await api.setSeriesAlerts(true);
        expect(
          (await api.object('/api/me/release-settings'))['followSeenSeries'],
          isTrue,
        );
        await api.setSeriesAlerts(false);
        stage = 'notification inbox';
        expect((await api.releaseNotifications())['items'], isEmpty);
        stage = 'programme details and custom reminder';
        final start = Uri.encodeComponent(
          DateTime.now().toUtc().toIso8601String(),
        );
        final guide = await api.object('/api/tv/guide?start=$start');
        final programs = (guide['channels'] as List).expand(
          (c) => c['programs'] as List,
        );
        final programme = programs.firstWhere(
          (p) =>
              DateTime.parse(p['startAt'])
                  .isAfter(DateTime.now().add(const Duration(minutes: 30))),
        );
        final info = await api.object(
          '/api/tv/programmes/${Uri.encodeComponent(programme['id'])}',
        );
        expect(info['cast'], isA<List>());
        final reminder = await api.saveReminder(programme['id'], 17);
        final saved = await api.list('/api/me/reminders');
        expect(
          saved.any(
            (r) => r['id'] == reminder['id'] && r['offsetMinutes'] == 17,
          ),
          isTrue,
        );
        await api.cancelReminder(reminder['id']);
        expect(await api.list('/api/me/reminders'), isEmpty);
        for (final path in ['taste', 'history', 'feedback', 'watchlist']) {
          expect(await api.list('/api/me/$path'), isEmpty);
        }
      } catch (_) {
        // Never allow Dio request headers or credentials into test output.
        fail(
          'Live release verification failed at $stage; sensitive details withheld.',
        );
      } finally {
        if (created) {
          try {
            await api.deleteAccount(password: password);
          } catch (_) {
            fail(
              'Disposable live release account cleanup failed; credentials withheld.',
            );
          }
        }
      }
      await expectLater(api.settings(), throwsA(anything));
    },
    skip: Platform.environment['NEX_LIVE_INVITE'] == null,
    timeout: const Timeout(Duration(minutes: 4)),
  );
}
