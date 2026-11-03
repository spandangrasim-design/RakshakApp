# Rakshak Field (no-login patrol app)

Flow: first launch -> pick industry, enter site code, name, mobile number, take a selfie (once) ->
routes of that industry with shared status -> pick a route -> scan each checkpoint QR ->
after every scan "Any incident?" (only if the industry bought Incidents and the admin allowed it) ->
when every checkpoint is scanned the route shows DONE to every guard.

Backend: the same Worker. New public endpoints are under /api/v1/guest/*; everything else uses a
limited token issued at joining. Run SQL/004_field_app.sql, then in the Industries page switch on
"Field app: no-login guest enrolment" and set a Site code for each industry.

Build: GitHub Actions -> "Build Rakshak Field APK". Override the server with
`--dart-define=API_BASE=https://your-api/api/v1`.

v1 is online-only (no offline queue).
