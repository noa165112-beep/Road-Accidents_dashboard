import urllib.request
import json
import csv
import io

resource_id = '05d14adb-fe54-49f7-b7ce-f30348e2d959'
limit = 500  # We want >100 rows, let's fetch 500
url = f'https://data.gov.il/api/3/action/datastore_search?resource_id={resource_id}&limit={limit}'

print(f"Fetching data from {url}...")
try:
    req = urllib.request.urlopen(url)
    res = json.loads(req.read())
    
    if res['success']:
        records = res['result']['records']
        if not records:
            print("No records found.")
            exit()
            
        print(f"Fetched {len(records)} records. Saving to CSV...")
        
        # Get all field names
        fieldnames = list(records[0].keys())
        # Remove '_id' if present, as it's an internal DB id
        if '_id' in fieldnames:
            fieldnames.remove('_id')
            
        output_file = 'road_accidents_2024_sample.csv'
        with open(output_file, 'w', encoding='utf-8-sig', newline='') as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            for record in records:
                if '_id' in record:
                    del record['_id']
                writer.writerow(record)
                
        print(f"Successfully saved to {output_file}")
    else:
        print("API returned failure.")
except Exception as e:
    print('Error:', e)
