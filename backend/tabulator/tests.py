from django.core.cache import cache
from django.test import override_settings
from rest_framework.test import APITestCase

from .models import Candidate, Category, Criterion, Event, Judge, Score


@override_settings(TABULATOR_ADMIN_PASS='secret')
class TabulatorApiTests(APITestCase):
    def setUp(self):
        cache.clear()  # the login rate limit counts across tests otherwise
        # Start from a clean slate rather than the seed migration's defaults.
        Event.objects.all().delete()
        Judge.objects.all().delete()
        self.event = Event.objects.create(name='Pageant')
        self.c1 = Criterion.objects.create(event=self.event, name='Poise', weight=60)
        self.c2 = Criterion.objects.create(event=self.event, name='Impact', weight=40)
        self.cand = Candidate.objects.create(event=self.event, number=1, name='Candidate 1')
        self.judge = Judge.objects.create(name='Judge 1', code='1234')
        self.other = Judge.objects.create(name='Judge 2', code='5678')

    def login(self, role, secret):
        res = self.client.post('/api/auth/login', {'role': role, 'secret': secret}, format='json')
        if res.status_code == 200:
            self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {res.data['token']}")
        return res

    def submit(self, scores, event=None, candidate=None):
        item = {'eventId': (event or self.event).id, 'candidateId': (candidate or self.cand).id, 'scores': scores}
        return self.client.post('/api/scores', {'items': [item]}, format='json')

    def test_admin_login_rejects_wrong_password(self):
        self.assertEqual(self.login('admin', 'nope').status_code, 401)

    def test_state_requires_auth(self):
        self.assertIn(self.client.get('/api/state').status_code, (401, 403))

    def test_admin_sees_judge_codes(self):
        self.login('admin', 'secret')
        res = self.client.get('/api/state')
        self.assertEqual(res.status_code, 200)
        self.assertIn('code', res.data['judges'][0])

    def test_judge_does_not_see_codes_or_admin_endpoints(self):
        self.login('judge', '1234')
        res = self.client.get('/api/state')
        self.assertNotIn('code', res.data['judges'][0])
        self.assertEqual(self.client.post('/api/events', {'name': 'X'}, format='json').status_code, 403)

    def test_judge_submits_and_sees_only_own_scores(self):
        Score.objects.create(judge=self.other, candidate=self.cand, criterion=self.c1, value=10)
        self.login('judge', '1234')
        res = self.submit({str(self.c1.id): 90, str(self.c2.id): 80.5})
        self.assertEqual(len(res.data['saved']), 1)
        state = self.client.get('/api/state').data['scores']
        self.assertEqual(list(state[self.event.id][self.cand.id].keys()), [self.judge.id])
        self.assertEqual(state[self.event.id][self.cand.id][self.judge.id][self.c2.id], 80.5)

    def test_resubmission_updates_existing_scores(self):
        self.login('judge', '1234')
        self.submit({str(self.c1.id): 50, str(self.c2.id): 50})
        self.submit({str(self.c1.id): 70, str(self.c2.id): 75})
        self.assertEqual(Score.objects.count(), 2)
        self.assertEqual(float(Score.objects.get(criterion=self.c1).value), 70)

    def test_locked_event_rejects_scores(self):
        self.event.locked = True
        self.event.save()
        self.login('judge', '1234')
        res = self.submit({str(self.c1.id): 50, str(self.c2.id): 50})
        self.assertEqual(res.data['saved'], [])
        self.assertEqual(len(res.data['rejected']), 1)

    def test_incomplete_sheet_rejected(self):
        self.login('judge', '1234')
        res = self.submit({str(self.c1.id): 50})
        self.assertEqual(len(res.data['rejected']), 1)

    def test_negative_score_is_400(self):
        self.login('judge', '1234')
        self.assertEqual(self.submit({str(self.c1.id): -1, str(self.c2.id): 0}).status_code, 400)

    def test_score_above_criterion_max_is_rejected(self):
        self.c1.max_score = 10
        self.c1.save()
        self.login('judge', '1234')
        res = self.submit({str(self.c1.id): 10.5, str(self.c2.id): 80})
        self.assertEqual(res.data['saved'], [])
        self.assertIn('highest allowed', res.data['rejected'][0]['reason'])
        ok = self.submit({str(self.c1.id): 10, str(self.c2.id): 80})
        self.assertEqual(len(ok.data['saved']), 1)

    def test_max_score_defaults_to_100_and_is_exposed(self):
        self.login('admin', 'secret')
        crit = self.client.get('/api/state').data['events'][0]['criteria'][0]
        self.assertEqual(crit['max_score'], 100)
        self.client.patch(f'/api/criteria/{self.c2.id}', {'weight': 30}, format='json')
        res = self.client.post(
            '/api/criteria', {'event': self.event.id, 'name': 'Q&A', 'weight': 10, 'max_score': 20}, format='json'
        )
        self.assertEqual((res.status_code, res.data['max_score']), (201, 20))

    def test_max_score_cannot_drop_below_given_scores(self):
        Score.objects.create(judge=self.judge, candidate=self.cand, criterion=self.c1, value=15)
        self.login('admin', 'secret')
        res = self.client.patch(f'/api/criteria/{self.c1.id}', {'max_score': 10}, format='json')
        self.assertEqual(res.status_code, 400)
        self.assertIn('max_score', res.data)
        self.assertEqual(self.client.patch(f'/api/criteria/{self.c1.id}', {'max_score': 20}, format='json').status_code, 200)

    def test_criteria_weight_cannot_exceed_100(self):
        self.login('admin', 'secret')
        res = self.client.post('/api/criteria', {'event': self.event.id, 'name': 'Extra', 'weight': 1}, format='json')
        self.assertEqual(res.status_code, 400)
        self.assertIn('weight', res.data)
        ok = self.client.patch(f'/api/criteria/{self.c2.id}', {'weight': 30}, format='json')
        self.assertEqual(ok.status_code, 200)

    @override_settings(
        TABULATOR_LAN_HOSTS=['192.168.1.50'], TABULATOR_PUBLIC_PORT='8080', TABULATOR_HTTPS_PORT='8443',
        TABULATOR_DETECT_LAN=False,
    )
    def test_info_uses_host_lan_ip_in_docker(self):
        self.login('admin', 'secret')
        res = self.client.get('/api/info')
        self.assertEqual(res.data, {'port': 8080, 'httpsPort': 8443, 'ips': ['192.168.1.50']})

    def test_service_worker_is_served_from_the_root_with_scope_header(self):
        res = self.client.get('/sw.js')
        # 404 until the frontend is built; when present it must allow the root scope.
        if res.status_code == 200:
            self.assertEqual(res['Service-Worker-Allowed'], '/')
            self.assertIn('no-cache', res['Cache-Control'])

    def test_app_page_is_always_revalidated(self):
        res = self.client.get('/')
        # 503 until the frontend is built; when served, a stale copy must not pin an old build.
        if res.status_code == 200:
            self.assertEqual(res['Cache-Control'], 'no-cache')

    def test_health_is_public(self):
        self.assertEqual(self.client.get('/api/health').data, {'ok': True})

    def test_regenerating_code_signs_judge_out(self):
        self.login('admin', 'secret')
        res = self.client.post(f'/api/judges/{self.judge.id}/regenerate-code')
        self.assertNotEqual(res.data['code'], '1234')
        self.client.credentials(HTTP_AUTHORIZATION='Bearer 1234')
        self.assertEqual(self.client.get('/api/state').status_code, 401)

    # --- offline sync: the newest sheet wins -------------------------------------------

    def item(self, a, b, captured_at, candidate=None):
        return {
            'eventId': self.event.id,
            'candidateId': (candidate or self.cand).id,
            'scores': {str(self.c1.id): a, str(self.c2.id): b},
            'capturedAt': captured_at,
        }

    def values(self, judge=None):
        return sorted(float(v) for v in Score.objects.filter(judge=judge or self.judge).values_list('value', flat=True))

    def test_older_sheet_arriving_late_is_acknowledged_but_not_applied(self):
        self.login('judge', '1234')
        self.client.post('/api/scores', {'items': [self.item(90, 80, 2_000_000)]}, format='json')
        res = self.client.post('/api/scores', {'items': [self.item(10, 10, 1_000_000)]}, format='json')
        self.assertEqual(res.data['saved'][0]['stale'], True)
        self.assertEqual(self.values(), [80.0, 90.0])

    def test_newer_sheet_replaces_older(self):
        self.login('judge', '1234')
        self.client.post('/api/scores', {'items': [self.item(10, 10, 1_000_000)]}, format='json')
        res = self.client.post('/api/scores', {'items': [self.item(90, 80, 2_000_000)]}, format='json')
        self.assertEqual(res.data['saved'][0]['stale'], False)
        self.assertEqual(self.values(), [80.0, 90.0])

    def test_judge_requests_update_last_seen(self):
        self.assertIsNone(self.judge.last_seen_at)
        self.login('judge', '1234')
        self.client.get('/api/state')
        self.judge.refresh_from_db()
        self.assertIsNotNone(self.judge.last_seen_at)
        first = self.judge.last_seen_at
        self.client.get('/api/state')  # within 15 s: not written again
        self.judge.refresh_from_db()
        self.assertEqual(self.judge.last_seen_at, first)

    # --- organizer import (QR / manual) ------------------------------------------------

    def import_(self, items, source='qr', judge=None):
        payload = {'judgeId': (judge or self.judge).id, 'source': source, 'items': items}
        return self.client.post('/api/scores/import', payload, format='json')

    def test_import_is_admin_only(self):
        self.login('judge', '1234')
        self.assertEqual(self.import_([self.item(5, 5, 1)]).status_code, 403)

    def test_import_works_while_locked_and_records_source(self):
        self.event.locked = True
        self.event.save()
        self.login('admin', 'secret')
        res = self.import_([self.item(70, 60, 1_000_000)], source='manual')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.data['saved']), 1)
        self.assertEqual(set(Score.objects.values_list('source', flat=True)), {'manual'})

    def test_import_keeps_newer_scores_from_the_network(self):
        self.login('judge', '1234')
        self.client.post('/api/scores', {'items': [self.item(90, 80, 2_000_000)]}, format='json')
        self.client.credentials()
        self.login('admin', 'secret')
        res = self.import_([self.item(10, 10, 1_000_000)])
        self.assertTrue(res.data['saved'][0]['stale'])
        self.assertEqual(self.values(), [80.0, 90.0])

    def test_import_is_blocked_once_finalized(self):
        self.event.locked = True
        self.event.save()
        self.login('admin', 'secret')
        self.client.post(f'/api/events/{self.event.id}/finalize', {'force': True}, format='json')
        res = self.import_([self.item(5, 5, 1)])
        self.assertEqual(res.data['saved'], [])
        self.assertIn('final', res.data['rejected'][0]['reason'])

    def test_import_rejects_score_above_max(self):
        self.c1.max_score = 10
        self.c1.save()
        self.login('admin', 'secret')
        res = self.import_([self.item(12, 5, 1)])
        self.assertEqual(res.data['saved'], [])

    # --- finalize ------------------------------------------------------------------------

    def test_finalize_requires_lock(self):
        self.login('admin', 'secret')
        res = self.client.post(f'/api/events/{self.event.id}/finalize', {}, format='json')
        self.assertEqual(res.status_code, 400)

    def test_finalize_lists_missing_sheets_unless_forced(self):
        Score.objects.create(judge=self.judge, candidate=self.cand, criterion=self.c1, value=5)
        Score.objects.create(judge=self.judge, candidate=self.cand, criterion=self.c2, value=5)
        self.event.locked = True
        self.event.save()
        self.login('admin', 'secret')
        res = self.client.post(f'/api/events/{self.event.id}/finalize', {}, format='json')
        self.assertEqual(res.status_code, 409)
        self.assertEqual(res.data['missing'], [{'judgeId': self.other.id, 'candidateId': self.cand.id}])
        forced = self.client.post(f'/api/events/{self.event.id}/finalize', {'force': True}, format='json')
        self.assertEqual(forced.status_code, 200)
        self.assertIsNotNone(forced.data['finalized_at'])

    def test_finalized_event_cannot_be_unlocked_until_reopened(self):
        self.event.locked = True
        self.event.save()
        self.login('admin', 'secret')
        self.client.post(f'/api/events/{self.event.id}/finalize', {'force': True}, format='json')
        res = self.client.patch(f'/api/events/{self.event.id}', {'locked': False}, format='json')
        self.assertEqual(res.status_code, 400)
        self.client.post(f'/api/events/{self.event.id}/unfinalize')
        res = self.client.patch(f'/api/events/{self.event.id}', {'locked': False}, format='json')
        self.assertEqual(res.status_code, 200)

    def test_state_exposes_finalized_and_last_seen_to_admin_only(self):
        self.login('admin', 'secret')
        data = self.client.get('/api/state').data
        self.assertIn('finalized_at', data['events'][0])
        self.assertIn('last_seen_at', data['judges'][0])
        self.assertIn('serverTime', data)
        self.client.credentials()
        self.login('judge', '1234')
        self.assertNotIn('last_seen_at', self.client.get('/api/state').data['judges'][0])

    def test_categories_group_entries_and_appear_in_state(self):
        self.login('admin', 'secret')
        res = self.client.post('/api/categories', {'event': self.event.id, 'name': ' Female ', 'order': 0}, format='json')
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.data['name'], 'Female')
        female = res.data['id']
        dup = self.client.post('/api/categories', {'event': self.event.id, 'name': 'female'}, format='json')
        self.assertEqual(dup.status_code, 400)
        res = self.client.post(
            '/api/candidates', {'event': self.event.id, 'category': female, 'number': 2, 'name': 'B'}, format='json'
        )
        self.assertEqual(res.status_code, 201)
        event = self.client.get('/api/state').data['events'][0]
        self.assertEqual([c['name'] for c in event['categories']], ['Female'])
        self.assertEqual({c['name']: c['category'] for c in event['candidates']}, {'Candidate 1': None, 'B': female})

    def test_category_must_belong_to_the_entrys_event(self):
        self.login('admin', 'secret')
        other = Event.objects.create(name='MTV')
        foreign = Category.objects.create(event=other, name='Solo')
        res = self.client.patch(f'/api/candidates/{self.cand.id}', {'category': foreign.id}, format='json')
        self.assertEqual(res.status_code, 400)

    def test_deleting_a_category_keeps_its_entries(self):
        self.login('admin', 'secret')
        cat = Category.objects.create(event=self.event, name='Male')
        self.cand.category = cat
        self.cand.save()
        self.assertEqual(self.client.delete(f'/api/categories/{cat.id}').status_code, 204)
        self.cand.refresh_from_db()
        self.assertIsNone(self.cand.category)

    def test_judges_cannot_edit_categories(self):
        self.login('judge', '1234')
        res = self.client.post('/api/categories', {'event': self.event.id, 'name': 'X'}, format='json')
        self.assertIn(res.status_code, (401, 403))
