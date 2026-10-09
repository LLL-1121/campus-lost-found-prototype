import json
import sqlite3
import sys
import tempfile
import threading
import time
import unittest
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from server import ThreadingHTTPServer, init_db, make_handler


class ApiTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.db = str(Path(self.temp.name) / 'test.db')
        init_db(self.db)
        self.http = ThreadingHTTPServer(('127.0.0.1', 0), make_handler(self.db))
        self.thread = threading.Thread(target=self.http.serve_forever, daemon=True)
        self.thread.start()
        self.url = 'http://127.0.0.1:%s' % self.http.server_port
        self.item = dict(type='lost', category='校园卡', title='蓝色卡套', place='图书馆', date='2026-10-09', description='演示数据', contact='demo_only', images=[])

    def tearDown(self):
        self.http.shutdown()
        self.http.server_close()
        self.thread.join()
        self.temp.cleanup()

    def call(self, method, path='/api/items', data=None, token='a'*64):
        request = Request(self.url+path, data=json.dumps(data).encode() if data is not None else None, method=method, headers={'Content-Type':'application/json','X-Owner-Token':token})
        try:
            response = urlopen(request)
        except HTTPError as error:
            response = error
        with response:
            return response.status, json.loads(response.read())

    def create(self):
        status, item = self.call('POST', data=self.item)
        self.assertEqual(status, 201)
        return item['id']

    def test_create_and_list(self):
        self.create()
        self.assertTrue(self.call('GET')[1][0]['mine'])

    def test_empty_title(self):
        self.assertEqual(self.call('POST', data=dict(self.item,title=' '))[0],400)

    def test_invalid_type(self):
        self.assertEqual(self.call('POST', data=dict(self.item,type='invalid'))[0],400)

    def test_invalid_date(self):
        self.assertEqual(self.call('POST', data=dict(self.item,date='2026-02-30'))[0],400)

    def test_bad_image(self):
        self.assertEqual(self.call('POST', data=dict(self.item,images=['data:image/png;base64,YQ==']))[0],400)

    def test_image_limit(self):
        self.assertEqual(self.call('POST', data=dict(self.item,images=['x']*7))[0],400)

    def test_missing_token(self):
        self.assertEqual(self.call('POST', data=self.item,token='')[0],401)

    def test_other_owner_cannot_edit(self):
        id = self.create()
        self.assertEqual(self.call('PUT', '/api/items/'+str(id), {'title':'恶意改动'},'b'*64)[0],403)

    def test_other_owner_cannot_delete(self):
        id = self.create()
        self.assertEqual(self.call('DELETE', '/api/items/'+str(id),token='b'*64)[0],403)

    def test_edit_state_independent(self):
        id = self.create()
        status, item = self.call('PUT','/api/items/'+str(id),dict(title='新名称',resolved=True,closed=True))
        self.assertEqual(status,200)
        self.assertTrue(item['resolved'] and item['closed'])
        self.assertEqual(item['title'],'新名称')

    def test_owner_field_not_writable(self):
        id = self.create()
        self.assertEqual(self.call('PUT','/api/items/'+str(id),{'owner':'b'*64})[0],400)

    def test_persistence_and_token_hash(self):
        self.create()
        init_db(self.db)
        with sqlite3.connect(self.db) as db:
            rows = db.execute('SELECT owner,payload FROM items').fetchall()
        self.assertEqual(len(rows),1)
        self.assertNotEqual(rows[0][0],'a'*64)
        self.assertEqual(json.loads(rows[0][1])['title'],'蓝色卡套')

    def test_private_files_not_served(self):
        self.assertEqual(self.call('GET','/server.py')[0],404)
        self.assertEqual(self.call('GET','/lostfound.db')[0],404)

    def test_delete_then_not_found(self):
        id = self.create()
        self.assertEqual(self.call('DELETE','/api/items/'+str(id))[0],200)
        self.assertEqual(self.call('PUT','/api/items/'+str(id),{'title':'新名称'})[0],404)


if __name__ == '__main__':
    started = time.time()
    result = unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(ApiTests))
    record = dict(started_at=started, finished_at=time.time(), tests=result.testsRun, failures=len(result.failures), errors=len(result.errors), passed=result.wasSuccessful())
    Path(__file__).with_name('api-results.json').write_text(json.dumps(record, indent=2), encoding='utf-8')
    sys.exit(not result.wasSuccessful())
