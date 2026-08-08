import os, sys, time, tarfile, urllib.request, urllib.error
import posixpath
print("os.__name__:", getattr(os, "__name__", "?"))
print("os.__file__:", getattr(os, "__file__", "?"))
print("os is posixpath?", os is posixpath)
print("has environ:", hasattr(os, "environ"))
print("has getenv:", hasattr(os, "getenv"))
print("has makedirs:", hasattr(os, "makedirs"))
print("has remove:", hasattr(os, "remove"))
print("has path:", hasattr(os, "path"))
print("has dirname:", hasattr(os, "dirname"))
try:
    os.path = posixpath
    print("rebind ok; os.path.dirname('a/b'):", os.path.dirname("a/b"))
except Exception as e:
    print("rebind ERR:", repr(e))
