import os
import sys
import time
import tarfile
import urllib.request
import urllib.error
import posixpath
print("BEFORE rebind: os.path is os?", os.path is os)
print("BEFORE: has environ:", hasattr(os, "environ"))
os.path = posixpath
print("AFTER rebind: os.path is posixpath?", os.path is posixpath)
print("AFTER: os.path.dirname?", hasattr(os.path, "dirname"))
try:
    r = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    print("ROOT ok:", r)
except Exception as e:
    print("ROOT ERR:", repr(e))
try:
    print("environ HF_TOKEN present:", "HF_TOKEN" in os.environ)
except Exception as e:
    print("environ ERR:", repr(e))
