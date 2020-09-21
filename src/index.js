import { DataFrame, fromCSV, Series } from "data-forge"
import {
	get,
	mapCountryData,
	getLatestUpdate,
	topoData,
	storeInCache,
	getInCache,
	getTests,
} from "./utils"

const getRawDataFromGithub = async (forceFreshData = false) => {
	// If we're already working, wait
	if (getInCache("isWorking", 5e3))
		await new Promise((resolve) => setTimeout(resolve, 500))

	storeInCache("isWorking", true)

	// Limit to 1 request to GitHub / minute
	if (!forceFreshData) {
		const cache = getInCache("githubData", 60e3)
		if (cache) return cache
	}

	const result = await Promise.all([
		get(
			"https://github.com/CSSEGISandData/COVID-19/raw/master/csse_covid_19_data/csse_covid_19_time_series/time_series_covid19_confirmed_global.csv"
		).catch(() => false),
		get(
			"https://github.com/CSSEGISandData/COVID-19/raw/master/csse_covid_19_data/csse_covid_19_time_series/time_series_covid19_deaths_global.csv"
		).catch(() => false),
		get(
			"https://github.com/CSSEGISandData/COVID-19/raw/master/csse_covid_19_data/csse_covid_19_time_series/time_series_covid19_recovered_global.csv"
		).catch(() => false),
	])

	storeInCache("githubData", result)

	return result
}

export const getData = async () => {
	let [cases, deaths, recovered] = await getRawDataFromGithub()

	if (cases) cases = fromCSV(cases)
	if (deaths) deaths = fromCSV(deaths)
	if (recovered) recovered = fromCSV(recovered)

	const tests = await getTests()

	// Takes a row dataframe and will return a single one, grouped by countries and deflated values
	const groupAndSummarize = (input, name) => {
		// Clone dataframe, just in case
		return new DataFrame(input)
			.select((r) => {
				// Match country name between GSSE & country-json package
				const keys = Object.keys(r).filter(
					(k) => k !== "Country/Region"
				)

				const cleanObj = {}
				keys.forEach((k) => {
					cleanObj[k] = r[k]
				})

				return {
					"Country/Region": mapCountryData(r["Country/Region"]),
					...cleanObj,
				}
			})
			.setIndex("Country/Region")
			.groupBy((r) => r["Country/Region"])
			.select((g) => {
				// Extract all dates
				const dates = new Set()
				g.forEach((grp) => {
					Object.keys(grp)
						.filter((k) => k.match(/(?:[0-9]{1,2}\/?){3}/i))
						.forEach((k) => dates.add(k))
				})

				// Create timeseries by deflating all groups of countries
				let timeseries = []
				dates.forEach((d) => {
					timeseries.push({
						date: new Date(`${d} UTC`).toISOString(),
						value: g.deflate((r) => parseInt(r[d])).sum(),
					})
				})
				timeseries = new Series(timeseries).orderBy((r) => r.date)

				// The final object returned for that row
				const countryName = g.first()["Country/Region"]
				const clean = {
					country: countryName,
					lat: parseFloat(g.first()["Lat"]),
					long: parseFloat(g.first()["Long"]),
					countryCode: mapCountryData(countryName, "code"),
					countryISO: mapCountryData(countryName, "iso"),
					countryCapital: mapCountryData(countryName, "capital"),
					countrySurface: mapCountryData(countryName, "surface"),
					countryPopulation: mapCountryData(
						countryName,
						"population"
					),
					countryPopulationDensity: mapCountryData(
						countryName,
						"popDensity"
					),
				}

				// Add the deflated timeseries
				clean[name] = timeseries.toArray()

				// Add the current (latest) value for that country & series
				clean[`${name}Current`] = timeseries.last().value || 0

				// Add tests if we have the data
				if (tests && Array.isArray(tests))
					tests.forEach((t) => {
						if (t.countryCode === clean.countryCode)
							clean.tests = t.data
					})

				return clean
			})
			.inflate()
			.setIndex("country")
	}

	// Transform CSV data obtained from Github
	cases = groupAndSummarize(cases, "cases")
	deaths = groupAndSummarize(deaths, "deaths")
	recovered = groupAndSummarize(recovered, "recovered")

	// Try to get latest update timestamp
	const latestUpdate = await getLatestUpdate().catch(() => new DataFrame())

	// Merge all frames together (index is country, ordered by country name)
	const countryData = cases
		.merge(deaths, recovered, latestUpdate)
		.orderBy((r) => r.country)

	const final = {
		sources: [
			"https://github.com/CSSEGISandData/COVID-19",
			"https://github.com/samayo/country-json",
			"https://www.ecdc.europa.eu/en/publications-data/covid-19-testing",
		],
		lastUpdated: new Date().toISOString(),
		latestUpdate:
			countryData
				.where((r) => r.latestUpdate)
				.orderByDescending((r) => r.latestUpdate)
				.select((r) => r.latestUpdate)
				.head(1)
				.toArray()[0] || false,
		currentCases:
			new Series(
				countryData
					.where((r) => r.casesCurrent)
					.select((r) => r.casesCurrent)
			).sum() || false,
		currentDeaths:
			new Series(
				countryData
					.where((r) => r.deathsCurrent)
					.select((r) => r.deathsCurrent)
			).sum() || false,
		currentRecovered:
			new Series(
				countryData
					.where((r) => r.recoveredCurrent)
					.select((r) => r.recoveredCurrent)
			).sum() || false,
		countryData: countryData.toArray(),
	}

	return final
}

export const getTopoData = async () => {
	const data = await getData()

	return topoData(data)
}
