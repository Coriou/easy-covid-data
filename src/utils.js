import axios from "axios"
import { DataFrame, fromCSV } from "data-forge"
import countries from "world-atlas/countries-50m.json"
import { feature } from "topojson"
import countryNameMap from "./countryNameMap"

import countryCodes from "country-json/src/country-by-abbreviation.json"
import countryISO from "country-json/src/country-by-iso-numeric.json"
import countryPopulation from "country-json/src/country-by-population.json"
import countryCapital from "country-json/src/country-by-capital-city.json"
import countrySurface from "country-json/src/country-by-surface-area.json"
import countryPopDensity from "country-json/src/country-by-population-density.json"

export const get = (url, options = {}) =>
	axios
		.get(url, options)
		.then((resp) => resp.data)
		.catch((err) => err)

export const mapCountryData = (input, type) => {
	input = String(input)

	const countryNameMatch = countryNameMap.find((v) => {
		if (!Array.isArray(v.from)) v.from = [v.from]

		const match = v.from.find((from) => {
			if (from instanceof RegExp) if (input.match(from)) return true
			if (typeof from === "string") if (input === from) return true
		})

		return match
	})

	if (countryNameMatch) input = countryNameMatch.to

	type = String(type).toLocaleLowerCase()
	let match = false

	switch (type) {
		case "name":
		default:
			return input

		case "code":
			match = countryCodes.find((r) => r.country === input)
			if (match) return match.abbreviation ? match.abbreviation : false

			return ""

		case "iso":
			match = countryISO.find((r) => r.country === input)
			if (match)
				return match.iso ? String(match.iso).padStart(3, "0") : false

			return ""

		case "population":
			match = countryPopulation.find((r) => r.country === input)
			if (match)
				return match.population ? parseInt(match.population) : false

			return ""

		case "capital":
			match = countryCapital.find((r) => r.country === input)
			if (match) return match.city ? match.city : false

			return ""

		case "surface":
			match = countrySurface.find((r) => r.country === input)
			if (match) return match.area ? parseInt(match.area) : false

			return ""

		case "popdensity":
			match = countryPopDensity.find((r) => r.country === input)
			if (match) return match.density ? parseFloat(match.density) : false

			return ""
	}
}

// Get the latest data from Github (yesterday's)
export const getLatestURL = async () => {
	const directoryContents = await get(
		"https://api.github.com/repos/CSSEGISandData/COVID-19/contents/csse_covid_19_data/csse_covid_19_daily_reports",
		{
			headers: {
				Authorization: `token ${process.env.GITHUB_TOKEN}`,
			},
		}
	).catch(() => false)

	if (directoryContents)
		return new DataFrame(directoryContents)
			.where(
				(row) =>
					row &&
					row.type === "file" &&
					row.name.match(/^[0-9]{1,2}-[0-9]{1,2}-[0-9]{4}\.csv$/i)
			)
			.select((row) => {
				return {
					date: new Date(`${row.name.replace(/\.csv/i, "")} UTC`),
					name: row.name,
					url: row.download_url,
				}
			})
			.orderByDescending((r) => r.date)
			.head(1)
			.select((r) => r.url)
			.toArray()[0]

	// Return yesterday's shit otherwise
	const yesterday = new Date()
	yesterday.setDate(yesterday.getDate() - 1).toLocaleString()

	const [date, month, year] = [
		("0" + yesterday.getDate()).slice(-2),
		("0" + (yesterday.getMonth() + 1)).slice(-2),
		yesterday.getFullYear(),
	]
	const yesterdayString = `${month}-${date}-${year}`
	return `https://github.com/CSSEGISandData/COVID-19/raw/master/csse_covid_19_data/csse_covid_19_daily_reports/${yesterdayString}.csv`
}

export const getLatestUpdate = async () => {
	const latestUrl = await getLatestURL().catch(() => false)
	if (!latestUrl) return new DataFrame()

	const latest = await get(latestUrl)
		.then((csv) => fromCSV(csv))
		.catch(() => false)

	if (!latest) return new DataFrame()

	return (
		new DataFrame(
			latest
				.select((r) => {
					// Match country name between GSSE & country-json package
					const keys = Object.keys(r).filter(
						(k) => k !== "Country_Region"
					)

					const cleanObj = {}
					keys.forEach((k) => {
						cleanObj[k] = r[k]
					})

					return {
						Country_Region: mapCountryData(r["Country_Region"]),
						...cleanObj,
					}
				})
				.setIndex("Country_Region")
				.groupBy((r) => r["Country_Region"])
				.select((g) => {
					return {
						country: g.first()["Country_Region"],
						latestUpdate: g
							.deflate((r) =>
								new Date(
									`${r["Last_Update"]} UTC`
								).toISOString()
							)
							.orderByDescending((d) => d)
							.head(1)
							.toArray()[0],
					}
				})
		).setIndex("country") || new DataFrame()
	)
}

export const topoData = (data) => {
	return feature(countries, countries.objects.countries).features.map((f) => {
		const country = mapCountryData(String(f.properties.name))

		const match = data.countryData.find(
			(c) =>
				mapCountryData(String(c.country)).toLowerCase() ===
				country.toLowerCase()
		)

		const { name } = f.properties
		f.properties = { name: country, originalName: name }

		return match ? { feature: f, data: match } : { feature: f }
	})
}
