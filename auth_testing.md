# Auth Testing Playbook

Step 1: MongoDB Verification
```
mongosh
use diet_planner_db
db.users.find({role: "admin"}).pretty()
```
Verify bcrypt hash starts with `$2b$`. Verify unique index on users.email.

Step 2: API Testing
```
curl -c cookies.txt -X POST $API/api/auth/register -H 'Content-Type: application/json' -d '{"email":"t@t.com","password":"pw12345","name":"T"}'
curl -c cookies.txt -X POST $API/api/auth/login -H 'Content-Type: application/json' -d '{"email":"admin@dietai.com","password":"admin123"}'
curl -b cookies.txt $API/api/auth/me
```