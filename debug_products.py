import requests

resp = requests.get('http://localhost:8000/api/products', params={'limit': 60, 'sort': 'newest', 'group': 'women', 'max_price': 5000}, timeout=20)
print('STATUS', resp.status_code)
print('TOTAL', resp.json().get('total'))
print('COUNT', len(resp.json().get('items', [])))
for i, p in enumerate(resp.json().get('items', []), 1):
    print(i, p.get('name'), 'active=', p.get('active'), 'price=', p.get('effective_price'), 'group=', p.get('group'))
