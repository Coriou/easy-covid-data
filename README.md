# EASY-COVID-DATA

This projects takes data from [CSSEGISandData/COVID-19](https://github.com/CSSEGISandData/COVID-19), parses it and returns it in a much friendlier format.

This project is used in production to power a Discord bot able to rapidly give data about the current situation regarding the pandemic.

## Installation

`npm i @coriou/easy-covid-data` or `yarn add @coriou/easy-covid-data`

## Example

```js
import { getData } from "@coriou/easy-covid-data"

getData()
	.then(({ countryData }) => {
		const france = countryData.find((country) => country.countryCode === "FR")

		console.log(france)
	})
	.catch(console.error)
```

Result:

```json
{
	"country": "France",
	"lat": 3.9339,
	"long": -53.1258,
	"countryCode": "FR",
	"countryISO": "250",
	"countryCapital": "Paris",
	"countrySurface": 551500,
	"countryPopulation": 64979548,
	"countryPopulationDensity": 120.59,
	"cases": [{ "date": "2020-01-22T00:00:00.000Z", "value": 0 }, "..."],
	"casesCurrent": 57749,
	"deaths": [{ "date": "2020-01-22T00:00:00.000Z", "value": 0 }, "..."],
	"deathsCurrent": 4043,
	"recovered": [{ "date": "2020-01-22T00:00:00.000Z", "value": 0 }, "..."],
	"recoveredCurrent": 11053
}
```

## API

The modules exports two methods which both take no arguments and return a promise:

### `getData`

Johns Hopkins' data, aggregated and enriched with data from [samayo/country-json](https://github.com/samayo/country-json)

```json
{
	"sources": ["https://github.com/CSSEGISandData/COVID-19", "..."],
	"lastUpdated": "2020-04-02T14:10:27.786Z",
	"latestUpdate": "2020-04-01T22:04:58.000Z",
	"currentCases": 932605,
	"currentDeaths": 46809,
	"currentRecovered": 193177,
	"countryData": [
		{
			"country": "Afghanistan",
			"lat": 33,
			"long": 65,
			"countryCode": "AF",
			"countryISO": "004",
			"countryCapital": "Kabul",
			"countrySurface": 652090,
			"countryPopulation": 35530081,
			"countryPopulationDensity": 46.8,
			"cases": [
				{
					"date": "2020-01-22T00:00:00.000Z",
					"value": 0
				},
				"..."
			],
			"casesCurrent": 237,
			"deaths": [
				{
					"date": "2020-01-22T00:00:00.000Z",
					"value": 0
				},
				"..."
			],
			"deathsCurrent": 4,
			"recovered": [
				{
					"date": "2020-01-22T00:00:00.000Z",
					"value": 0
				},
				"..."
			],
			"recoveredCurrent": 5,
			"latestUpdate": "2020-04-01T21:58:34.000Z"
		},
		"..."
	]
}
```

### `getTopoData`

Topo data from [topojson/world-atlas](https://github.com/topojson/world-atlas) enriched with Johns Hopkins' data / country. This is very useful to plot a map.

```json
[
	{
		"feature": {
			"type": "Feature",
			"id": "716",
			"properties": {
				"name": "Zimbabwe",
				"originalName": "Zimbabwe"
			},
			"geometry": {
				"type": "Polygon",
				"coordinates": ["..."]
			}
		},
		"data": {
			"country": "Zimbabwe",
			"lat": -20,
			"long": 30,
			"countryCode": "ZW",
			"countryISO": "716",
			"countryCapital": "Harare",
			"countrySurface": 390757,
			"countryPopulation": 16529904,
			"countryPopulationDensity": 36.58,
			"cases": [
				{
					"date": "2020-01-22T00:00:00.000Z",
					"value": 0
				},
				"..."
			],
			"casesCurrent": 8,
			"deaths": [
				{
					"date": "2020-01-22T00:00:00.000Z",
					"value": 0
				},
				"..."
			],
			"deathsCurrent": 1,
			"recovered": [
				{
					"date": "2020-01-22T00:00:00.000Z",
					"value": 0
				},
				"..."
			],
			"recoveredCurrent": 0,
			"latestUpdate": "2020-04-01T21:58:34.000Z"
		}
	},
	"..."
]
```

## Use the data directly

I maintain Github Gists with this data, you can find them and use them directly there:

- **Country Data**: [`covid-19.json`](https://gist.github.com/9c1092560b251f2843d802b0b04beb87)
- **Topo Data**: [`covid-19-topojson.json`](https://gist.github.com/201288651baee8df5fcb45f056237739)
