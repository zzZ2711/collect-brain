import os
print("os file:", getattr(os, "__file__", "?"))
print("has path:", hasattr(os, "path"))
print("has dirname:", hasattr(os.path, "dirname"))
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
print("ROOT ok:", ROOT)
