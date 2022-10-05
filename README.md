# Vaillant heater control

This project contains a little board (and software) to control a Vaillant heater.

It is currently Work in Progress and not everything works!!

## PCB

/kicad

The schematic shows a PCB which controls the Vaillant heater via 789 interface which is just an analog voltage to control the flow temperature (Vorlauftemperatur).

## Esphome

/esphome

A simple config to use the PCB with an ESP32.

## NodeJS

Small NodeJS application, it reads out the data from the heater.
It isn't really well made and more intended for temporary and debugging purposes.

It will log the data to the console and a json log.
It will display a graph on a little webpage.
It will publish the data to mqtt in a HomeAssistant compatible format.
