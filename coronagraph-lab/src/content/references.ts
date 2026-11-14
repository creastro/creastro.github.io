/**
 * Bibliography of Coronagraph Lab. Every entry was checked by web search (November 2026) against the
 * publisher page, NASA ADS, arXiv or a library record; `checkedAgainst` names where the authors, year, title,
 * journal, volume, pages and DOI were confirmed. Entries that could not be fully confirmed are not listed here
 * (see docs/coronagraph-lab/PROGRESS.md).
 */

export interface Reference {
  readonly key: string
  readonly authors: readonly string[]
  readonly year: number
  readonly title: string
  readonly journal: string
  readonly volume: string
  readonly pages: string
  readonly doi: string
  /** Journal article (true) or conference proceedings (false). */
  readonly peerReviewed: boolean
  readonly checkedAgainst: string
}

export const REFERENCES: readonly Reference[] = [
  { key: 'lyot1939', authors: ['Lyot, B.'], year: 1939, title: 'The study of the solar corona and prominences without eclipses (George Darwin Lecture, 1939)', journal: 'Monthly Notices of the Royal Astronomical Society', volume: '99', pages: '580–594', doi: '10.1093/mnras/99.8.580', peerReviewed: true, checkedAgainst: 'ADS 1939MNRAS..99..580L; OUP' },
  { key: 'soummer2005', authors: ['Soummer, R.'], year: 2005, title: 'Apodized pupil Lyot coronagraphs for arbitrary telescope apertures', journal: 'The Astrophysical Journal Letters', volume: '618', pages: 'L161–L164', doi: '10.1086/427923', peerReviewed: true, checkedAgainst: 'arXiv astro-ph/0412221 journal reference and DOI' },
  { key: 'kuchner2002', authors: ['Kuchner, M. J.', 'Traub, W. A.'], year: 2002, title: 'A coronagraph with a band-limited mask for finding terrestrial planets', journal: 'The Astrophysical Journal', volume: '570', pages: '900–908', doi: '10.1086/339625', peerReviewed: true, checkedAgainst: 'arXiv astro-ph/0203455; ADS 2002ApJ...570..900K' },
  { key: 'kasdin2003', authors: ['Kasdin, N. J.', 'Vanderbei, R. J.', 'Spergel, D. N.', 'Littman, M. G.'], year: 2003, title: 'Extrasolar planet finding via optimal apodized-pupil and shaped-pupil coronagraphs', journal: 'The Astrophysical Journal', volume: '582', pages: '1147–1161', doi: '10.1086/344751', peerReviewed: true, checkedAgainst: 'Princeton research portal; library catalog record' },
  { key: 'roddier1997', authors: ['Roddier, F.', 'Roddier, C.'], year: 1997, title: 'Stellar coronograph with phase mask', journal: 'Publications of the Astronomical Society of the Pacific', volume: '109', pages: '815–820', doi: '10.1086/133949', peerReviewed: true, checkedAgainst: 'ADS 1997PASP..109..815R; Scilit' },
  { key: 'rouan2000', authors: ['Rouan, D.', 'Riaud, P.', 'Boccaletti, A.', 'Clénet, Y.', 'Labeyrie, A.'], year: 2000, title: 'The four-quadrant phase-mask coronagraph. I. Principle', journal: 'Publications of the Astronomical Society of the Pacific', volume: '112', pages: '1479–1486', doi: '10.1086/317707', peerReviewed: true, checkedAgainst: 'IOPscience; Scilit' },
  { key: 'mawet2005', authors: ['Mawet, D.', 'Riaud, P.', 'Absil, O.', 'Surdej, J.'], year: 2005, title: 'Annular groove phase mask coronagraph', journal: 'The Astrophysical Journal', volume: '633', pages: '1191–1200', doi: '10.1086/462409', peerReviewed: true, checkedAgainst: 'IOPscience; ADS 2005ApJ...633.1191M; ORBi' },
  { key: 'foo2005', authors: ['Foo, G.', 'Palacios, D. M.', 'Swartzlander, G. A., Jr.'], year: 2005, title: 'Optical vortex coronagraph', journal: 'Optics Letters', volume: '30', pages: '3308–3310', doi: '10.1364/OL.30.003308', peerReviewed: true, checkedAgainst: 'Physics Today listing; ADS 2005OptL...30.3308F' },
  { key: 'mawet2010', authors: ['Mawet, D.', 'Serabyn, E.', 'Liewer, K.', 'Burruss, R.', 'Hickey, J.', 'Shemo, D.'], year: 2010, title: 'The vector vortex coronagraph: laboratory results and first light at Palomar Observatory', journal: 'The Astrophysical Journal', volume: '709', pages: '53–57', doi: '10.1088/0004-637X/709/1/53', peerReviewed: true, checkedAgainst: 'arXiv 0912.2287; IAEA INIS record' },
  { key: 'codona2004', authors: ['Codona, J. L.', 'Angel, R.'], year: 2004, title: 'Imaging extrasolar planets by stellar halo suppression in separately corrected color bands', journal: 'The Astrophysical Journal Letters', volume: '604', pages: 'L117–L120', doi: '10.1086/383569', peerReviewed: true, checkedAgainst: 'arXiv astro-ph/0402420; University of Arizona portal' },
  { key: 'kenworthy2007', authors: ['Kenworthy, M. A.', 'Codona, J. L.', 'Hinz, P. M.', 'Angel, J. R. P.', 'Heinze, A.', 'Sivanandam, S.'], year: 2007, title: 'First on-sky high-contrast imaging with an apodizing phase plate', journal: 'The Astrophysical Journal', volume: '660', pages: '762–769', doi: '10.1086/513596', peerReviewed: true, checkedAgainst: 'arXiv astro-ph/0702324; University of Arizona portal' },
  { key: 'otten2017', authors: ['Otten, G. P. P. L.', 'Snik, F.', 'Kenworthy, M. A.', 'Keller, C. U.', 'Males, J. R.', 'Morzinski, K. M.', 'Close, L. M.', 'Codona, J. L.', 'Hinz, P. M.', 'Hornburg, K. J.', 'Brickson, L. L.', 'Escuti, M. J.'], year: 2017, title: 'On-sky performance analysis of the vector apodizing phase plate coronagraph on MagAO/Clio2', journal: 'The Astrophysical Journal', volume: '834', pages: '175', doi: '10.3847/1538-4357/834/2/175', peerReviewed: true, checkedAgainst: 'Duke Scholars; arXiv 1702.04193' },
  { key: 'guyon2003', authors: ['Guyon, O.'], year: 2003, title: 'Phase-induced amplitude apodization of telescope pupils for extrasolar terrestrial planet imaging', journal: 'Astronomy & Astrophysics', volume: '404', pages: '379–387', doi: '10.1051/0004-6361:20030457', peerReviewed: true, checkedAgainst: 'A&A article page; arXiv astro-ph/0301190' },
  { key: 'sivaramakrishnan2001', authors: ['Sivaramakrishnan, A.', 'Koresko, C. D.', 'Makidon, R. B.', 'Berkefeld, T.', 'Kuchner, M. J.'], year: 2001, title: 'Ground-based coronagraphy with high-order adaptive optics', journal: 'The Astrophysical Journal', volume: '552', pages: '397–408', doi: '10.1086/320444', peerReviewed: true, checkedAgainst: 'arXiv astro-ph/0103012; published article header' },
  { key: 'soummer2007', authors: ['Soummer, R.', 'Pueyo, L.', 'Sivaramakrishnan, A.', 'Vanderbei, R. J.'], year: 2007, title: 'Fast computation of Lyot-style coronagraph propagation', journal: 'Optics Express', volume: '15', pages: '15935–15951', doi: '10.1364/OE.15.015935', peerReviewed: true, checkedAgainst: 'Optica article page; PubMed 19550881; arXiv 0711.0368' },
  { key: 'platt2001', authors: ['Platt, B. C.', 'Shack, R.'], year: 2001, title: 'History and principles of Shack–Hartmann wavefront sensing', journal: 'Journal of Refractive Surgery', volume: '17', pages: 'S573–S577', doi: '10.3928/1081-597X-20010901-13', peerReviewed: true, checkedAgainst: 'PubMed 11583233; library catalog record' },
  { key: 'ragazzoni1996', authors: ['Ragazzoni, R.'], year: 1996, title: 'Pupil plane wavefront sensing with an oscillating prism', journal: 'Journal of Modern Optics', volume: '43', pages: '289–293', doi: '10.1080/09500349608232742', peerReviewed: true, checkedAgainst: 'Taylor & Francis abstract URL; Crossref-format reference lists' },
  { key: 'ndiaye2013', authors: ["N'Diaye, M.", 'Dohlen, K.', 'Fusco, T.', 'Paul, B.'], year: 2013, title: 'Calibration of quasi-static aberrations in exoplanet direct-imaging instruments with a Zernike phase-mask sensor', journal: 'Astronomy & Astrophysics', volume: '555', pages: 'A94', doi: '10.1051/0004-6361/201219797', peerReviewed: true, checkedAgainst: 'A&A article page; arXiv 1305.5143' },
  { key: 'roddier1988', authors: ['Roddier, F.'], year: 1988, title: 'Curvature sensing and compensation: a new concept in adaptive optics', journal: 'Applied Optics', volume: '27', pages: '1223–1225', doi: '10.1364/AO.27.001223', peerReviewed: true, checkedAgainst: 'Optica abstract page ao-27-7-1223' },
  { key: 'gonsalves1982', authors: ['Gonsalves, R. A.'], year: 1982, title: 'Phase retrieval and diversity in adaptive optics', journal: 'Optical Engineering', volume: '21', pages: '829–832', doi: '10.1117/12.7972989', peerReviewed: true, checkedAgainst: 'Scilit; independent reference lists (Opt. Eng. 21, 829–832)' },
  { key: 'baudoz2006', authors: ['Baudoz, P.', 'Boccaletti, A.', 'Baudrand, J.', 'Rouan, D.'], year: 2006, title: 'The self-coherent camera: a new tool for planet detection', journal: 'Proceedings of IAU Colloquium 200, Direct Imaging of Exoplanets: Science & Techniques', volume: '200', pages: '553–558', doi: '10.1017/S174392130600994X', peerReviewed: false, checkedAgainst: 'Cambridge PDF first page; ADS' },
  { key: 'galicher2010', authors: ['Galicher, R.', 'Baudoz, P.', 'Rousset, G.', 'Totems, J.', 'Mas, M.'], year: 2010, title: 'Self-coherent camera as a focal plane wavefront sensor: simulations', journal: 'Astronomy & Astrophysics', volume: '509', pages: 'A31', doi: '10.1051/0004-6361/200912902', peerReviewed: true, checkedAgainst: 'A&A article page; arXiv 0911.2465' },
  { key: 'borde2006', authors: ['Bordé, P. J.', 'Traub, W. A.'], year: 2006, title: 'High-contrast imaging from space: speckle nulling in a low-aberration regime', journal: 'The Astrophysical Journal', volume: '638', pages: '488–498', doi: '10.1086/498669', peerReviewed: true, checkedAgainst: 'arXiv astro-ph/0510597 journal reference and DOI' },
  { key: 'trauger2007', authors: ['Trauger, J. T.', 'Traub, W. A.'], year: 2007, title: 'A laboratory demonstration of the capability to image an Earth-like extrasolar planet', journal: 'Nature', volume: '446', pages: '771–773', doi: '10.1038/nature05729', peerReviewed: true, checkedAgainst: 'Nature article page; Springer reference entries' },
  { key: 'giveon2007', authors: ["Give'on, A.", 'Belikov, R.', 'Shaklan, S.', 'Kasdin, J.'], year: 2007, title: 'Closed loop, DM diversity-based, wavefront correction algorithm for high contrast imaging systems', journal: 'Optics Express', volume: '15', pages: '12338–12343', doi: '10.1364/OE.15.012338', peerReviewed: true, checkedAgainst: 'Optica article page; Princeton research portal' },
  { key: 'groff2016', authors: ['Groff, T. D.', 'Riggs, A. J. E.', 'Kern, B.', 'Kasdin, N. J.'], year: 2016, title: 'Methods and limitations of focal plane sensing, estimation, and control in high-contrast imaging', journal: 'Journal of Astronomical Telescopes, Instruments, and Systems', volume: '2', pages: '011009', doi: '10.1117/1.JATIS.2.1.011009', peerReviewed: true, checkedAgainst: 'SPIE Digital Library; Princeton research portal' },
  { key: 'malbet1995', authors: ['Malbet, F.', 'Yu, J. W.', 'Shao, M.'], year: 1995, title: 'High-dynamic-range imaging using a deformable mirror for space coronography', journal: 'Publications of the Astronomical Society of the Pacific', volume: '107', pages: '386–398', doi: '10.1086/133563', peerReviewed: true, checkedAgainst: 'Scilit; arXiv astro-ph/9502042' },
  { key: 'guyon2005', authors: ['Guyon, O.'], year: 2005, title: 'Limits of adaptive optics for high-contrast imaging', journal: 'The Astrophysical Journal', volume: '629', pages: '592–614', doi: '10.1086/431209', peerReviewed: true, checkedAgainst: 'arXiv astro-ph/0505086 journal reference and DOI' },
  { key: 'guyon2006', authors: ['Guyon, O.', 'Pluzhnik, E. A.', 'Kuchner, M. J.', 'Collins, B.', 'Ridgway, S. T.'], year: 2006, title: 'Theoretical limits on extrasolar terrestrial planet detection with coronagraphs', journal: 'The Astrophysical Journal Supplement Series', volume: '167', pages: '81–99', doi: '10.1086/507630', peerReviewed: true, checkedAgainst: 'Crossref-sourced library record; arXiv astro-ph/0608506' },
  { key: 'noll1976', authors: ['Noll, R. J.'], year: 1976, title: 'Zernike polynomials and atmospheric turbulence', journal: 'Journal of the Optical Society of America', volume: '66', pages: '207–211', doi: '10.1364/JOSA.66.000207', peerReviewed: true, checkedAgainst: 'doi.org landing page (search result); Scilit' },
  { key: 'por2018', authors: ['Por, E. H.', 'Haffert, S. Y.', 'Radhakrishnan, V. M.', 'Doelman, D. S.', 'van Kooten, M.', 'Bos, S. P.'], year: 2018, title: 'High Contrast Imaging for Python (HCIPy): an open-source adaptive optics and coronagraph simulator', journal: 'Proceedings of SPIE, Adaptive Optics Systems VI', volume: '10703', pages: '1070342', doi: '10.1117/12.2314407', peerReviewed: false, checkedAgainst: 'SPIE Digital Library page' },
]

export function referenceByKey(key: string): Reference {
  const r = REFERENCES.find((x) => x.key === key)
  if (!r) throw new Error(`Unknown reference ${key}`)
  return r
}

/** Short author–year label, e.g. "Kuchner & Traub 2002" or "Rouan et al. 2000". */
export function shortCite(r: Reference): string {
  const last = (a: string) => a.split(',')[0]
  const who = r.authors.length === 1 ? last(r.authors[0]) : r.authors.length === 2 ? `${last(r.authors[0])} & ${last(r.authors[1])}` : `${last(r.authors[0])} et al.`
  return `${who} ${r.year}`
}

/** Full citation text, without the DOI link. */
export function fullCite(r: Reference): string {
  const auth = r.authors.length > 6 ? `${r.authors.slice(0, 6).join(', ')}, et al.` : r.authors.join(', ')
  return `${auth} ${r.year}, “${r.title}”, ${r.journal} ${r.volume}, ${r.pages}.`
}
