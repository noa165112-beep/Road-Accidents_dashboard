import urllib.request
import json
import urllib.parse

query = urllib.parse.quote('תאונות דרכים')
url = f'https://data.gov.il/api/3/action/package_search?q={query}'

try:
    req = urllib.request.urlopen(url)
    res = json.loads(req.read())
    if res['success']:
        for pkg in res['result']['results']:
            print(f"Package: {pkg['title']}")
            for res in pkg['resources']:
                if res['format'].lower() == 'csv':
                    print(f"  -> CSV Resource: {res['name']} | ID: {res['id']}")
except Exception as e:
    print('Error:', e)
