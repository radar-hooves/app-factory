import sys
import urllib.request

try:
    print("ANSWERED", urllib.request.urlopen(sys.argv[1], timeout=3).status)
except Exception as e:
    print("REFUSED", type(e).__name__, e)
