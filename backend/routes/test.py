from passlib.hash import bcrypt

# Step 1: original password
plain_password = "prisca"

# Step 2: create bcrypt hash
bcrypt_hash = bcrypt.hash(plain_password)

print("Use this bcrypt hash in your DB:", bcrypt_hash)


# single_check.py
import hashlib

given_hash = "1044fd1d09b4559a697dd7665b5dc47fa18fb4cc3066a00760f76dc310ab94ab"
candidate = "your_candidate_here"   # replace with a guess, e.g. "prisca"

candidate_hash = hashlib.sha256(candidate.encode()).hexdigest()
print("candidate:", candidate)
print("candidate SHA256:", candidate_hash)
print("matches given?", candidate_hash == given_hash)

