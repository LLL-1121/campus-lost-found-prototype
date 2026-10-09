"""校园失物招领：Python 标准库 API 与 SQLite。python server.py"""
import argparse
import base64
import hashlib
import hmac
import json
import re
import sqlite3
from datetime import date
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent
MAX_BODY = 8 * 1024 * 1024
CATEGORIES = {'校园卡', '钥匙', '电子设备', '书籍', '生活用品', '其他'}


class RequestError(Exception):
    def __init__(self, status, message):
        self.status, self.message = status, message


def owner_hash(token):
    if not re.fullmatch(r'[a-f0-9]{64}', token or ''):
        raise RequestError(401, '缺少有效的发布者凭证，请重新打开页面。')
    return hashlib.sha256(token.encode()).hexdigest()


def validate(data):
    if not isinstance(data, dict):
        raise RequestError(400, '请求必须为 JSON 对象。')
    result = {}
    for name, limit in [('title', 60), ('place', 80), ('description', 600), ('contact', 80)]:
        value = data.get(name)
        if not isinstance(value, str) or not value.strip() or len(value.strip()) > limit:
            raise RequestError(400, f'{name} 必须为 1 到 {limit} 个字符。')
        result[name] = value.strip()
    if data.get('type') not in {'lost', 'found'} or data.get('category') not in CATEGORIES:
        raise RequestError(400, '信息类型或类别无效。')
    result.update(type=data['type'], category=data['category'])
    try:
        result['date'] = date.fromisoformat(data.get('date', '')).isoformat()
    except (ValueError, TypeError):
        raise RequestError(400, '日期格式无效。')
    images = data.get('images', [])
    if not isinstance(images, list) or len(images) > 6:
        raise RequestError(400, '最多上传 6 张图片。')
    for image in images:
        if not isinstance(image, str):
            raise RequestError(400, '图片格式无效。')
        match = re.fullmatch(r'data:image/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)', image)
        if not match or len(image) > 1400000:
            raise RequestError(400, '图片必须为压缩后的 PNG、JPEG 或 WebP。')
        try:
            raw = base64.b64decode(match[2], validate=True)
        except ValueError:
            raise RequestError(400, '图片编码无效。')
        signatures = {'jpeg': raw.startswith(b'\xff\xd8\xff'), 'png': raw.startswith(b'\x89PNG\r\n\x1a\n'), 'webp': raw[:4] == b'RIFF' and raw[8:12] == b'WEBP'}
        if not signatures[match[1]]:
            raise RequestError(400, '图片内容与格式不符。')
    result['images'] = images
    return result


def init_db(database):
    with sqlite3.connect(database) as db:
        db.execute('CREATE TABLE IF NOT EXISTS items (id INTEGER PRIMARY KEY AUTOINCREMENT, owner TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)')


def make_handler(database):
    class Handler(BaseHTTPRequestHandler):
        def respond(self, status, body, mime='application/json; charset=utf-8'):
            content = json.dumps(body, ensure_ascii=False).encode() if mime.startswith('application/json') else body
            self.send_response(status)
            self.send_header('Content-Type', mime)
            self.send_header('Content-Length', str(len(content)))
            self.send_header('X-Content-Type-Options', 'nosniff')
            self.send_header('Referrer-Policy', 'same-origin')
            self.send_header('Cache-Control', 'no-store')
            self.send_header('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; object-src 'none'; frame-ancestors 'none'")
            self.end_headers()
            self.wfile.write(content)

        def do_GET(self):
            path = urlparse(self.path).path
            if path == '/api/items':
                try:
                    token = self.headers.get('X-Owner-Token')
                    digest = owner_hash(token) if token else None
                    with sqlite3.connect(database) as db:
                        rows = db.execute('SELECT id, owner, payload, created_at FROM items ORDER BY id DESC').fetchall()
                    self.respond(200, [dict(json.loads(row[2]), id=row[0], mine=digest == row[1], created_at=row[3]) for row in rows])
                except RequestError as error:
                    self.respond(error.status, {'error': error.message})
                return
            static = {'/': ('index.html', 'text/html; charset=utf-8'), '/index.html': ('index.html', 'text/html; charset=utf-8'), '/app.js': ('app.js', 'text/javascript; charset=utf-8'), '/style.css': ('style.css', 'text/css; charset=utf-8')}
            if path not in static:
                self.respond(404, {'error': '资源不存在。'})
                return
            name, mime = static[path]
            self.respond(200, (ROOT / name).read_bytes(), mime)

        def mutation(self):
            try:
                digest = owner_hash(self.headers.get('X-Owner-Token'))
                if self.command != 'DELETE' and self.headers.get('Content-Type', '').split(';')[0] != 'application/json':
                    raise RequestError(415, '请使用 application/json。')
                try:
                    length = int(self.headers.get('Content-Length', '0'))
                except ValueError:
                    raise RequestError(400, '请求长度无效。')
                if length < 0 or length > MAX_BODY:
                    raise RequestError(413, '请求过大，请减少图片。')
                try:
                    data = json.loads(self.rfile.read(length)) if length else {}
                except (ValueError, UnicodeError):
                    raise RequestError(400, 'JSON 格式无效。')
                path = urlparse(self.path).path
                with sqlite3.connect(database) as db:
                    if self.command == 'POST' and path == '/api/items':
                        item = validate(data)
                        item.update(resolved=False, closed=False)
                        cursor = db.execute('INSERT INTO items(owner,payload) VALUES (?,?)', (digest, json.dumps(item, ensure_ascii=False)))
                        self.respond(201, dict(item, id=cursor.lastrowid, mine=True))
                        return
                    match = re.fullmatch(r'/api/items/(\d+)', path)
                    if not match or self.command not in {'PUT', 'DELETE'}:
                        raise RequestError(404, '接口不存在。')
                    row = db.execute('SELECT owner,payload FROM items WHERE id=?', (match[1],)).fetchone()
                    if not row:
                        raise RequestError(404, '信息已不存在。')
                    if not hmac.compare_digest(row[0], digest):
                        raise RequestError(403, '只能管理本人发布的信息。')
                    if self.command == 'DELETE':
                        db.execute('DELETE FROM items WHERE id=?', (match[1],))
                        self.respond(200, {'ok': True})
                        return
                    if not isinstance(data, dict) or any(k not in {'type', 'title', 'category', 'place', 'date', 'description', 'contact', 'images', 'resolved', 'closed'} for k in data):
                        raise RequestError(400, '更新字段无效。')
                    item = json.loads(row[1])
                    merged = dict(item, **data)
                    clean = validate(merged)
                    for key in ['resolved', 'closed']:
                        if type(merged.get(key)) is not bool:
                            raise RequestError(400, '状态必须为布尔值。')
                        clean[key] = merged[key]
                    db.execute('UPDATE items SET payload=? WHERE id=?', (json.dumps(clean, ensure_ascii=False), match[1]))
                    self.respond(200, dict(clean, id=int(match[1]), mine=True))
            except RequestError as error:
                self.respond(error.status, {'error': error.message})
            except sqlite3.Error:
                self.respond(503, {'error': '数据库暂不可用，请稍后重试。'})

        do_POST = mutation
        do_PUT = mutation
        do_DELETE = mutation

    return Handler


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--host', default='127.0.0.1')
    parser.add_argument('--port', default=8765, type=int)
    parser.add_argument('--database', default=str(ROOT / 'lostfound.db'))
    args = parser.parse_args()
    init_db(args.database)
    print(f'校园失物招领：http://{args.host}:{args.port}', flush=True)
    ThreadingHTTPServer((args.host, args.port), make_handler(args.database)).serve_forever()
