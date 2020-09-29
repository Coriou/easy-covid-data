import axios from "axios"
import { DataFrame, fromCSV } from "data-forge"
import countries from "world-atlas/countries-50m.json"
import { feature } from "topojson"
import xlxs from "xlsx"
import cheerio from "cheerio"
import countryNameMap from "./countryNameMap"

import countryCodes from "country-json/src/country-by-abbreviation.json"
import countryISO from "country-json/src/country-by-iso-numeric.json"
import countryPopulation from "country-json/src/country-by-population.json"
import countryCapital from "country-json/src/country-by-capital-city.json"
import countrySurface from "country-json/src/country-by-surface-area.json"
import countryPopDensity from "country-json/src/country-by-population-density.json"

export const get = (url, options = {}) =>
	axios
		.get(
			url,
			Object.assign(
				{},
				{
					headers: {
						"User-Agent":
							"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.121 Safari/537.36",
					},
				},
				options
			)
		)
		.then(resp => resp.data)
		.catch(err => err)

export const mapCountryData = (input, type) => {
	input = String(input)

	const countryNameMatch = countryNameMap.find(v => {
		if (!Array.isArray(v.from)) v.from = [v.from]

		const match = v.from.find(from => {
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
			match = countryCodes.find(r => r.country === input)
			if (match) return match.abbreviation ? match.abbreviation : false

			return ""

		case "iso":
			match = countryISO.find(r => r.country === input)
			if (match)
				return match.iso ? String(match.iso).padStart(3, "0") : false

			return ""

		case "population":
			match = countryPopulation.find(r => r.country === input)
			if (match)
				return match.population ? parseInt(match.population) : false

			return ""

		case "capital":
			match = countryCapital.find(r => r.country === input)
			if (match) return match.city ? match.city : false

			return ""

		case "surface":
			match = countrySurface.find(r => r.country === input)
			if (match) return match.area ? parseInt(match.area) : false

			return ""

		case "popdensity":
			match = countryPopDensity.find(r => r.country === input)
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
				row =>
					row &&
					row.type === "file" &&
					row.name.match(/^[0-9]{1,2}-[0-9]{1,2}-[0-9]{4}\.csv$/i)
			)
			.select(row => {
				return {
					date: new Date(`${row.name.replace(/\.csv/i, "")} UTC`),
					name: row.name,
					url: row.download_url,
				}
			})
			.orderByDescending(r => r.date)
			.head(1)
			.select(r => r.url)
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
		.then(csv => fromCSV(csv))
		.catch(() => false)

	if (!latest) return new DataFrame()

	return (
		new DataFrame(
			latest
				.select(r => {
					// Match country name between GSSE & country-json package
					const keys = Object.keys(r).filter(
						k => k !== "Country_Region"
					)

					const cleanObj = {}
					keys.forEach(k => {
						cleanObj[k] = r[k]
					})

					return {
						Country_Region: mapCountryData(r["Country_Region"]),
						...cleanObj,
					}
				})
				.setIndex("Country_Region")
				.groupBy(r => r["Country_Region"])
				.select(g => {
					return {
						country: g.first()["Country_Region"],
						latestUpdate: g
							.deflate(r =>
								new Date(
									`${r["Last_Update"]} UTC`
								).toISOString()
							)
							.orderByDescending(d => d)
							.head(1)
							.toArray()[0],
					}
				})
		).setIndex("country") || new DataFrame()
	)
}

export const topoData = data => {
	return feature(countries, countries.objects.countries).features.map(f => {
		const country = mapCountryData(String(f.properties.name))

		const match = data.countryData.find(
			c =>
				mapCountryData(String(c.country)).toLowerCase() ===
				country.toLowerCase()
		)

		const { name } = f.properties
		f.properties = { name: country, originalName: name }

		return match ? { feature: f, data: match } : { feature: f }
	})
}

const isDate = date => Object.prototype.toString.call(date) === "[object Date]"

const cache = []
export const storeInCache = (name, data) => {
	name = String(name)
	cache[name] = { data: data, updated: new Date() }
}
export const getInCache = (name, ttl) => {
	name = String(name)
	const c = cache[name]
	if (!c) return false
	if (!c.updated || !isDate(c.updated)) return false
	if (!c.data) return false

	if (new Date().getTime() - c.updated.getTime() >= ttl) return false

	return c.data
}

// Parse ECDC's website to get the latest XML testing file, download it and convert it to CSV
export const grabTestsRaw = async () => {
	const page = await get(
		"https://www.ecdc.europa.eu/en/publications-data/covid-19-testing"
	).catch(() => false)

	if (!page) return false

	let xmlLink = false

	const $ = cheerio.load(page)
	$(".download__item")
		.find("a")
		.each((i, a) => {
			if (
				$(a)
					.attr("type")
					.match(/application\/vnd\.openxmlformats/)
			)
				xmlLink = $(a).attr("href")
		})

	return new Promise((resolve, reject) => {
		const cache = getInCache("testsData", 60e3)
		if (cache) return resolve(cache)

		get(xmlLink, { responseType: "stream" })
			.catch(reject)
			.then(stream => {
				const xmlBuffer = []

				stream.on("data", data => xmlBuffer.push(data))
				stream.on("end", () => {
					// Concat the buffer, parse the XML and convert it to CSV
					const XLS = xlxs.read(Buffer.concat(xmlBuffer), {
						type: "buffer",
					})

					const CSV = xlxs.utils.sheet_to_csv(
						XLS.Sheets[XLS.SheetNames[0]]
					)

					storeInCache("testsData", CSV)
					return resolve(CSV)
				})
			})
	})
}

export const getTests = async () => {
	const testsRaw = fromCSV(await grabTestsRaw())

	return testsRaw
		.groupBy(r => r["country_code"])
		.select(r => {
			return {
				countryCode: r.toArray()[0]["country_code"],
				data: r
					.orderBy(r => r["year_week"])
					.toArray()
					.map(c => {
						const [, Y, W] = c["year_week"].match(
							/(\d{4})-W(\d{2})/i
						)

						return {
							count: parseInt(c["tests_done"]),
							lastUpdateWeek: c["year_week"],
							lastUpdateStart: getWeekFromNumber(W, Y),
							lastUpdateEnd: getWeekFromNumber(W, Y, true),
						}
					}),
			}
		})
		.toArray()
}

// https://stackoverflow.com/a/16591175/10298824
export const getWeekFromNumber = (w, y, last = false) => {
	const simple = new Date(Date.UTC(y, 0, 1 + (w - 1) * 7))
	const dow = simple.getDay()
	const ISOweekStart = simple

	if (dow <= 4) ISOweekStart.setDate(simple.getDate() - simple.getDay() + 1)
	else ISOweekStart.setDate(simple.getDate() + 8 - simple.getDay())

	if (last) {
		ISOweekStart.setDate(ISOweekStart.getDate() + 7)
		ISOweekStart.setSeconds(ISOweekStart.getSeconds() + -1)
	}

	return ISOweekStart
}
