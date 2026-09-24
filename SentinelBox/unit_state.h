// Estado de cada HVAC visto por el gateway. En un header aparte para que el Arduino IDE
// lo declare antes de los prototipos que genera solo.
#pragma once

#include <Arduino.h>
#include "sentinel_ann.h"

#define PERSIST_WINDOW 5  // ventana de la persistencia (lecturas)

struct UnitState {
  String id;
  sentinel_obs_t baseline;  // NAN en un canal = ese sensor nunca reportó
  sentinel_obs_t learnSum;
  int learned;  // ventanas aprendidas; >= LEARN_WINDOWS = baseline listo
  int nCur, nTemp;
  uint8_t history[PERSIST_WINDOW];  // clase de la red en las últimas lecturas (0/1/2)
  int historyPos;
  float healthSmooth;
  float scoreSmooth[3];  // vibración, corriente, temperatura (suavizados como la salud)
};
