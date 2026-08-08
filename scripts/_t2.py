import os
import sys
import time
import tarfile
import urllib.request
import urllib.error
print("os file:", getattr(os, "__file__", "?"))
print("has dirname:", hasattr(os.path, "dirname"), hasattr(os.path, "path"))
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
print("OK ROOT:", ROOT)
