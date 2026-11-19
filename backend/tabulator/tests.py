from django.test import override_settings
from rest_framework.test import APITestCase

from .models import Candidate, Criterion, Event, Judge, Score


@override_settings(TABULATOR_ADMIN_PASS='secret')
class TabulatorApiTests(APITestCase):
    def setUp(self):
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

    @override_settings(TABULATOR_LAN_HOSTS=['192.168.1.50'], TABULATOR_PUBLIC_PORT='8080', TABULATOR_DETECT_LAN=False)
    def test_info_uses_host_lan_ip_in_docker(self):
        self.login('admin', 'secret')
        res = self.client.get('/api/info')
        self.assertEqual(res.data, {'port': 8080, 'ips': ['192.168.1.50']})

    def test_health_is_public(self):
        self.assertEqual(self.client.get('/api/health').data, {'ok': True})

    def test_regenerating_code_signs_judge_out(self):
        self.login('admin', 'secret')
        res = self.client.post(f'/api/judges/{self.judge.id}/regenerate-code')
        self.assertNotEqual(res.data['code'], '1234')
        self.client.credentials(HTTP_AUTHORIZATION='Bearer 1234')
        self.assertEqual(self.client.get('/api/state').status_code, 401)
