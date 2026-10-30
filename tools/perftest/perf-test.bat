@echo off
rem One Knox Ambience perf test. Double-click for a run with the perf base preset, or pass options,
rem e.g.  perf-test.bat -Label before -Without KnoxAmbience   (see docs\perf-test.md)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0perf-test.ps1" %*
