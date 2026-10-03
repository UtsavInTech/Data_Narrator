import os
import tempfile

# Tests run against a throwaway storage folder, without the sample companies loading in the background.
os.environ.setdefault("DN_STORAGE_DIR", tempfile.mkdtemp(prefix="dn-test-"))
os.environ.setdefault("DN_DEMOS", "false")
