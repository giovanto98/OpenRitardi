import sys
import os
import importlib.util
import subprocess
# Run this in check_setup.py
print("\n=== Project Structure ===")
for filename in ['data/data_wrangling.ipynb', 'data/constants.py', 'data/raw_data']:
    print(f"{filename}: {'✓' if os.path.exists(filename) else '✗'}")

if os.path.exists('data/raw_data'):
    months = len([f for f in os.listdir('data/raw_data') 
                 if os.path.isdir(os.path.join('data/raw_data', f))])
    print(f"\nMonths with data: {months}")

print("\n=== Python Environment ===")
import sys
print(f"Python version: {sys.version}")

packages = ['pyspark', 'pandas', 'numpy', 'jupyter', 'seaborn', 'matplotlib']
import importlib
for pkg in packages:
    spec = importlib.util.find_spec(pkg)
    print(f"{pkg}: {'✓' if spec else '✗'}")