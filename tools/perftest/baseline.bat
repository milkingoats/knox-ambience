@echo off
rem Vanilla baseline, one command: fresh world at 10620,9550 (Muldraugh), only ZombieBuddy (+ the test mod),
rem Knox Ambience off then on. Each session takes screenshots, walks a loop, then drives along the nearest road.
rem About 20 minutes. Results in dev\_measure\runs. Extra options pass through, e.g. -Spawn 10862,10290,0
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0perf-test.ps1" -NewGame -Mods ZombieBuddy,KnoxAmbience -AB -Toggle KnoxAmbience -Label vanilla -Phases walk,drive,shots %*
