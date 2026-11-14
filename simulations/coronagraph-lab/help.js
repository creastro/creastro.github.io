/* Generated from coronagraph-lab/src/site/help.ts by "npm run build:site". Do not edit. */
(function() {
	// src/content/coronagraphInfo.ts
	var R$2 = String.raw;
	var CORONAGRAPH_INFO = [
		{
			id: "none",
			name: "No coronagraph",
			family: "Baseline",
			beginner: "The bare telescope. The star makes a bright spot with rings around it (the Airy pattern), and a faint planet nearby is lost in that glare. Every coronagraph is compared with this picture.",
			expert: [R$2`The detector field is the Fourier transform of the pupil field. For a clear circular pupil the image is the Airy pattern $[2J_1(\pi r)/(\pi r)]^2$ ($r$ in $\lambda/D$), whose rings fall only as $r^{-3}$: about $10^{-3}$ of the peak at 3 $\lambda/D$ and $10^{-4}$ at 7 $\lambda/D$, far brighter than a mature giant planet ($10^{-6}$–$10^{-9}$) or an Earth twin ($\sim10^{-10}$).`],
			formulas: [{
				note: "image of a point source",
				tex: R$2`I(\mathbf u)=\left|\mathcal F\{P(\mathbf x)\,e^{i\phi(\mathbf x)}\}\right|^2`
			}],
			strengths: ["Full throughput at every separation."],
			limitations: ["Diffraction rings and aberration speckles hide faint companions within a few tens of λ/D."],
			instruments: ["Every telescope without a coronagraph."],
			refs: ["guyon2006"],
			sim: "The baseline uses the same pupil, aberrations and detector as the coronagraphs, with no apodizer, mask or stop."
		},
		{
			id: "lyot",
			name: "Classical Lyot coronagraph",
			family: "Amplitude mask",
			beginner: "An opaque spot in the focal plane blocks the core of the star image. What leaks around the spot is diffracted to the edge of the next pupil image, where a slightly smaller ring-shaped stop (the Lyot stop) cuts it away.",
			expert: [R$2`Lyot invented the instrument to observe the solar corona outside eclipses. The occulter (radius $r_m$) removes the low spatial frequencies of the star image; in the next pupil plane (C) the remaining field is the pupil minus a smoothed copy of itself, which is small inside the pupil and concentrated in a bright ring at its edge. The Lyot stop, undersized to a fraction of $D$, blocks that ring.`, R$2`A hard-edged occulter cannot null the star: the smoothed copy of the pupil does not equal the pupil, so some light is left inside the stop. Larger occulters and smaller stops improve rejection at the cost of inner working angle (IWA ≈ $r_m$) and throughput. Sivaramakrishnan et al. (2001) describe the Lyot-plane field in detail.`],
			formulas: [{
				note: "Lyot-plane field (M = occulter transmission, L = Lyot stop)",
				tex: R$2`E_C=L\cdot\mathcal F^{-1}\{M\,\mathcal F\{E_A\}\},\qquad M(\mathbf u)=0\ \text{for}\ |\mathbf u|<r_m`
			}, {
				note: "Babinet form used in the simulation",
				tex: R$2`E_C=L\cdot\left(E_A-\mathcal F^{-1}\{\chi_{r_m}\mathcal F\{E_A\}\}\right)`
			}],
			strengths: ["Simple, achromatic occulter.", "Robust to low-order aberrations such as tip/tilt."],
			limitations: [
				"Moderate rejection: no perfect null.",
				"Inner working angle at least the occulter radius, typically 3–5 λ/D.",
				"Throughput lost to the undersized stop."
			],
			instruments: [
				"Lyot’s solar coronagraph (1930s)",
				"HST/ACS coronagraph",
				"Keck/NIRC2 occulting spots"
			],
			refs: [
				"lyot1939",
				"sivaramakrishnan2001",
				"soummer2007"
			],
			sim: "The occulter is propagated with the Babinet/MFT method of Soummer et al. (2007), with the mask edge averaged over sub-pixels."
		},
		{
			id: "aplc",
			name: "Apodized pupil Lyot coronagraph (APLC)",
			family: "Amplitude mask",
			beginner: "A Lyot coronagraph with a grey filter in the first pupil that dims the edges of the beam. With the right filter shape, the light that leaks past the spot is a scaled-down copy of the beam, so the Lyot stop can remove almost all of it.",
			expert: [R$2`Soummer (2005) showed that the best apodizer $\Phi$ is an eigenfunction of the operator "pupil → occulter → pupil": $P\,\mathcal F^{-1}\{\chi\,\mathcal F\{\Phi\}\}=\Lambda\Phi$. On axis the Lyot-plane field is then $(1-\Lambda)\Phi$, so the stellar peak is attenuated by $(1-\Lambda)^2$. For a circular pupil $\Phi$ is a generalised prolate spheroidal function; for any other aperture it can be computed numerically.`, R$2`$\Lambda$ approaches 1 as the occulter grows (here $\Lambda>0.9999$ for a 4.7 $\lambda/D$ diameter mask), but the apodizer then becomes more peaked and transmits less light, so real designs trade contrast against throughput.`],
			formulas: [{
				note: "eigenvalue problem for the apodizer",
				tex: R$2`\Lambda\,\Phi(\mathbf x)=P(\mathbf x)\,\mathcal F^{-1}\{\chi_{r_m}\,\mathcal F\{\Phi\}\}(\mathbf x)`
			}, {
				note: "on-axis residual in the Lyot plane",
				tex: R$2`E_C=(1-\Lambda)\,\Phi`
			}],
			strengths: ["Deep, achromatic rejection with a hard occulter.", "Works for obstructed and segmented apertures."],
			limitations: ["Apodizer throughput falls as the contrast goal rises.", "IWA set by the occulter (~2–4 λ/D)."],
			instruments: ["Gemini Planet Imager", "VLT/SPHERE"],
			refs: ["soummer2005", "soummer2007"],
			sim: "The apodizer is the leading eigenfunction of the discrete operator, found by Lanczos iterations for the current pupil and mask size."
		},
		{
			id: "bandlimited",
			name: "Band-limited Lyot coronagraph",
			family: "Amplitude mask",
			beginner: "The spot is replaced by a soft-edged mask whose transmission varies smoothly. Its smoothness guarantees that all the diffracted starlight lands in a thin band at the edges of the next pupil image, where the Lyot stop blocks it completely.",
			expert: [R$2`Kuchner & Traub (2002) required the mask amplitude $m(\mathbf u)=1-\hat w(\mathbf u)$ to be band-limited: the Fourier transform $w$ of $\hat w$ vanishes beyond a width $\epsilon D$. In the Lyot plane the field is $E_A-E_A\ast w$, which is exactly zero wherever the pupil is uniform over a distance $\epsilon D$. A stop eroded by $\epsilon D$ then passes no starlight at all: a perfect null, in the absence of aberrations.`, R$2`Here the mask is the linear sinc² design $m(u)=1-\mathrm{sinc}^2(\pi\epsilon u)$, whose kernel is a triangle of half-width $\epsilon D$. Smaller $\epsilon$ moves the IWA outwards ($\approx0.45/\epsilon$ $\lambda/D$) but keeps more of the pupil.`],
			formulas: [{
				note: "linear band-limited mask",
				tex: R$2`m(u)=1-\left[\frac{\sin(\pi\epsilon u)}{\pi\epsilon u}\right]^2`
			}, {
				note: "Lyot-plane field",
				tex: R$2`E_C=L\cdot(E_A-E_A\ast w),\qquad w(x)=0\ \text{for}\ |x|>\epsilon D`
			}],
			strengths: ["Theoretically perfect null for any pupil shape.", "Well understood analytically."],
			limitations: [
				"Mask fixed in physical size: chromatic (the kernel width scales with λ).",
				"Lyot stop loses ~2ε of the pupil.",
				"Sensitive to low-order aberrations."
			],
			instruments: ["JWST/NIRCam coronagraph masks"],
			refs: ["kuchner2002"],
			sim: "The mask is applied through its exact pupil-plane equivalent (convolution with the triangle kernel), so the monochromatic null is exact on the grid."
		},
		{
			id: "shaped",
			name: "Shaped pupil coronagraph",
			family: "Amplitude mask",
			beginner: "A black mask with carefully shaped openings is placed over the telescope pupil. The shapes are chosen so that the starlight spreads in a way that leaves deep dark zones on two sides of the star.",
			expert: [R$2`Kasdin et al. (2003) showed that binary (0/1) pupils can do the work of a smooth apodizer. Along the $u$ axis the far field of a pupil open for $|y|\le h(x)$ is the 1D Fourier transform of the opening height $2h(x)$; making $h$ a prolate spheroidal function concentrates the light within $|u|<b$ and leaves the regions beyond $b$ almost dark.`, R$2`Thin openings keep the field dark over a range of $v$ as well: here several stacked openings share the prolate height profile, which widens the dark zones to about ±25° around the $u$ axis.`],
			formulas: [{
				note: "far field along the axis",
				tex: R$2`E(u,0)=\int 2h(x)\,e^{-2\pi i u x}\,dx,\qquad h\propto\psi_0(x)`
			}],
			strengths: [
				"Achromatic (pure geometry).",
				"No focal-plane mask, so insensitive to pointing.",
				"Easy to make as a binary mask."
			],
			limitations: [
				"Dark zones cover only part of the field.",
				"Low throughput and wide PSF core.",
				"IWA ≈ b (typically 3–4 λ/D)."
			],
			instruments: ["Nancy Grace Roman Space Telescope Coronagraph Instrument (shaped-pupil modes)"],
			refs: ["kasdin2003"],
			sim: "Prolate function from a Lanczos eigen-solution; openings rasterised with exact coverage in y. Dark zones lie along ±x."
		},
		{
			id: "roddier",
			name: "Roddier & Roddier phase mask",
			family: "Phase mask",
			beginner: "A tiny transparent disk in the focal plane delays the centre of the star image by half a wavelength. The delayed light then cancels the rest of the starlight inside the pupil, and the Lyot stop removes what is pushed outside.",
			expert: [R$2`Roddier & Roddier (1997) chose the disk radius (≈0.53 $\lambda/D$ for a circular pupil) so that the field passing through the disk carries half of the on-axis amplitude. Shifting it by $\pi$ makes the Lyot-plane field $E_A-2\,\mathcal F^{-1}\{\chi\,\mathcal F\{E_A\}\}$, which nearly cancels inside the pupil. The null is partial for an unapodized pupil and the mask is chromatic, but the IWA is small (≈1 $\lambda/D$).`],
			formulas: [{
				note: "π-phase disk",
				tex: R$2`E_C=L\cdot\left(E_A-2\,\mathcal F^{-1}\{\chi_{r}\,\mathcal F\{E_A\}\}\right),\quad r\approx0.53\,\lambda/D`
			}],
			strengths: ["Small inner working angle.", "High off-axis throughput."],
			limitations: ["Only a partial null without pupil apodization.", "Disk size and phase are chromatic."],
			instruments: ["Laboratory demonstrations; the idea led to the four-quadrant and vortex masks"],
			refs: ["roddier1997"],
			sim: "Same Babinet/MFT propagation as the Lyot occulter, with (m − 1) = −2 inside the disk."
		},
		{
			id: "fqpm",
			name: "Four-quadrant phase mask (FQPM)",
			family: "Phase mask",
			beginner: "The focal plane is split into four quarters, two of which delay the light by half a wavelength. For a star exactly on the centre, the four parts of the image cancel each other inside the pupil, and all the starlight ends up outside the Lyot stop.",
			expert: [R$2`Rouan et al. (2000) proposed $m(u,v)=\mathrm{sign}(u)\,\mathrm{sign}(v)$. For a centred circular pupil the Lyot-plane field vanishes inside the geometric pupil, a perfect null, while an off-axis planet away from the quadrant boundaries passes almost unaffected. Planets near the boundaries are dimmed, and the phase step is chromatic unless made achromatic.`],
			formulas: [{
				note: "mask transmission",
				tex: R$2`m(u,v)=\operatorname{sign}(u)\,\operatorname{sign}(v)=e^{i\pi[\,u v<0\,]}`
			}],
			strengths: ["Perfect null for a circular pupil.", "Small IWA (~1 λ/D) and high throughput."],
			limitations: [
				"Dead zones along the quadrant boundaries.",
				"Chromatic π step.",
				"Sensitive to tip/tilt and central obstruction."
			],
			instruments: [
				"JWST/MIRI",
				"VLT/NACO",
				"VLT/SPHERE"
			],
			refs: ["rouan2000"],
			sim: "Multi-scale propagation (FFT plus finer MFT levels); throughput is measured at 45°, away from the boundaries."
		},
		{
			id: "vortex",
			name: "Vortex coronagraph",
			family: "Phase mask",
			beginner: "A focal-plane mask whose phase winds around the centre like a spiral staircase. For an on-axis star it throws all the light outside the pupil, where the Lyot stop blocks it, while light from a planet a little off-centre passes through.",
			expert: [R$2`The mask is $e^{il\theta}$ with an even topological charge $l$ (Mawet et al. 2005; Foo et al. 2005). For a circular pupil, the Lyot-plane field of an on-axis source is zero inside the pupil and falls as $(R/r)^{l}$ outside it, so a stop slightly smaller than the pupil gives a perfect null. Higher charges reject more low-order aberrations (tip/tilt, defocus) but move the IWA outward (about 1, 2 and 3 $\lambda/D$ for $l=2,4,6$ here).`, R$2`Achromatic versions use a geometric phase (subwavelength gratings, liquid-crystal polymers), such as the annular groove phase mask and the vector vortex (Mawet et al. 2010).`],
			formulas: [{
				note: "mask",
				tex: R$2`m(\rho,\theta)=e^{\,i\,l\,\theta},\qquad l=2,4,6`
			}, {
				note: "charge 2, uniform circular pupil of radius a (Lyot-plane amplitude)",
				tex: R$2`|E_C(r)|=\begin{cases}0,&r<a\\ (a/r)^2,&r>a\end{cases}`
			}],
			strengths: [
				"Perfect null and small IWA.",
				"High throughput, full 360° field.",
				"Achromatic implementations."
			],
			limitations: ["Null degraded by central obstructions and spiders.", "Sensitive to tip/tilt (charge 2)."],
			instruments: [
				"Keck/NIRC2",
				"VLT/NACO and VISIR (AGPM)",
				"Palomar Hale (vector vortex)"
			],
			refs: [
				"mawet2005",
				"foo2005",
				"mawet2010"
			],
			sim: "Multi-scale propagation with the singular point between samples; the null floor (~1e-8) is set by the sampling."
		},
		{
			id: "app",
			name: "Apodizing phase plate (APP / vAPP)",
			family: "Phase mask (pupil plane)",
			beginner: "A transparent plate in the pupil that only changes the phase of the light. The pattern is designed so that the starlight moves out of a D-shaped region on one side of the star, leaving a dark hole there. The vector version makes two images with dark holes on opposite sides.",
			expert: [R$2`Codona & Angel (2004) showed that a phase-only pupil $P\,e^{i\phi}$ can push the diffraction pattern out of a chosen region; the first on-sky plate (Kenworthy et al. 2007) cleared 2–9 $\lambda/D$ over 180°. Because $\mathcal F\{P e^{-i\phi}\}(\mathbf u)=\overline{\mathcal F\{P e^{i\phi}\}(-\mathbf u)}$ for a symmetric pupil, the conjugate phase gives the mirrored dark hole.`, R$2`The vector APP writes $\phi$ as a geometric phase in a liquid-crystal layer: the two circular polarisations receive $+\phi$ and $-\phi$, independent of wavelength. Polarisation leakage adds a faint copy of the normal PSF (Otten et al. 2017).`],
			formulas: [{
				note: "phase-only pupil",
				tex: R$2`E_A=P\,e^{\pm i\phi(\mathbf x)},\quad \phi\ \text{chosen so that}\ |\mathcal F\{E_A\}|^2\approx0\ \text{in the hole}`
			}],
			strengths: [
				"No focal-plane mask: insensitive to pointing and vibrations.",
				"Works on any aperture.",
				"vAPP is achromatic."
			],
			limitations: [
				"Dark hole on one side only (per channel).",
				"Part of the light leaves the core (lower Strehl).",
				"Classical APP is chromatic."
			],
			instruments: [
				"MMT (first APP)",
				"VLT/NACO",
				"Magellan MagAO/Clio2 (vAPP)",
				"LBT/LMIRCam"
			],
			refs: [
				"codona2004",
				"kenworthy2007",
				"otten2017"
			],
			sim: "Phase found with a Gerchberg–Saxton iteration on a q = 2 grid; the image is normalised to the APP core peak."
		}
	];
	// src/content/references.ts
	var REFERENCES = [
		{
			key: "lyot1939",
			authors: ["Lyot, B."],
			year: 1939,
			title: "The study of the solar corona and prominences without eclipses (George Darwin Lecture, 1939)",
			journal: "Monthly Notices of the Royal Astronomical Society",
			volume: "99",
			pages: "580–594",
			doi: "10.1093/mnras/99.8.580",
			peerReviewed: true,
			checkedAgainst: "ADS 1939MNRAS..99..580L; OUP"
		},
		{
			key: "soummer2005",
			authors: ["Soummer, R."],
			year: 2005,
			title: "Apodized pupil Lyot coronagraphs for arbitrary telescope apertures",
			journal: "The Astrophysical Journal Letters",
			volume: "618",
			pages: "L161–L164",
			doi: "10.1086/427923",
			peerReviewed: true,
			checkedAgainst: "arXiv astro-ph/0412221 journal reference and DOI"
		},
		{
			key: "kuchner2002",
			authors: ["Kuchner, M. J.", "Traub, W. A."],
			year: 2002,
			title: "A coronagraph with a band-limited mask for finding terrestrial planets",
			journal: "The Astrophysical Journal",
			volume: "570",
			pages: "900–908",
			doi: "10.1086/339625",
			peerReviewed: true,
			checkedAgainst: "arXiv astro-ph/0203455; ADS 2002ApJ...570..900K"
		},
		{
			key: "kasdin2003",
			authors: [
				"Kasdin, N. J.",
				"Vanderbei, R. J.",
				"Spergel, D. N.",
				"Littman, M. G."
			],
			year: 2003,
			title: "Extrasolar planet finding via optimal apodized-pupil and shaped-pupil coronagraphs",
			journal: "The Astrophysical Journal",
			volume: "582",
			pages: "1147–1161",
			doi: "10.1086/344751",
			peerReviewed: true,
			checkedAgainst: "Princeton research portal; library catalog record"
		},
		{
			key: "roddier1997",
			authors: ["Roddier, F.", "Roddier, C."],
			year: 1997,
			title: "Stellar coronograph with phase mask",
			journal: "Publications of the Astronomical Society of the Pacific",
			volume: "109",
			pages: "815–820",
			doi: "10.1086/133949",
			peerReviewed: true,
			checkedAgainst: "ADS 1997PASP..109..815R; Scilit"
		},
		{
			key: "rouan2000",
			authors: [
				"Rouan, D.",
				"Riaud, P.",
				"Boccaletti, A.",
				"Clénet, Y.",
				"Labeyrie, A."
			],
			year: 2e3,
			title: "The four-quadrant phase-mask coronagraph. I. Principle",
			journal: "Publications of the Astronomical Society of the Pacific",
			volume: "112",
			pages: "1479–1486",
			doi: "10.1086/317707",
			peerReviewed: true,
			checkedAgainst: "IOPscience; Scilit"
		},
		{
			key: "mawet2005",
			authors: [
				"Mawet, D.",
				"Riaud, P.",
				"Absil, O.",
				"Surdej, J."
			],
			year: 2005,
			title: "Annular groove phase mask coronagraph",
			journal: "The Astrophysical Journal",
			volume: "633",
			pages: "1191–1200",
			doi: "10.1086/462409",
			peerReviewed: true,
			checkedAgainst: "IOPscience; ADS 2005ApJ...633.1191M; ORBi"
		},
		{
			key: "foo2005",
			authors: [
				"Foo, G.",
				"Palacios, D. M.",
				"Swartzlander, G. A., Jr."
			],
			year: 2005,
			title: "Optical vortex coronagraph",
			journal: "Optics Letters",
			volume: "30",
			pages: "3308–3310",
			doi: "10.1364/OL.30.003308",
			peerReviewed: true,
			checkedAgainst: "Physics Today listing; ADS 2005OptL...30.3308F"
		},
		{
			key: "mawet2010",
			authors: [
				"Mawet, D.",
				"Serabyn, E.",
				"Liewer, K.",
				"Burruss, R.",
				"Hickey, J.",
				"Shemo, D."
			],
			year: 2010,
			title: "The vector vortex coronagraph: laboratory results and first light at Palomar Observatory",
			journal: "The Astrophysical Journal",
			volume: "709",
			pages: "53–57",
			doi: "10.1088/0004-637X/709/1/53",
			peerReviewed: true,
			checkedAgainst: "arXiv 0912.2287; IAEA INIS record"
		},
		{
			key: "codona2004",
			authors: ["Codona, J. L.", "Angel, R."],
			year: 2004,
			title: "Imaging extrasolar planets by stellar halo suppression in separately corrected color bands",
			journal: "The Astrophysical Journal Letters",
			volume: "604",
			pages: "L117–L120",
			doi: "10.1086/383569",
			peerReviewed: true,
			checkedAgainst: "arXiv astro-ph/0402420; University of Arizona portal"
		},
		{
			key: "kenworthy2007",
			authors: [
				"Kenworthy, M. A.",
				"Codona, J. L.",
				"Hinz, P. M.",
				"Angel, J. R. P.",
				"Heinze, A.",
				"Sivanandam, S."
			],
			year: 2007,
			title: "First on-sky high-contrast imaging with an apodizing phase plate",
			journal: "The Astrophysical Journal",
			volume: "660",
			pages: "762–769",
			doi: "10.1086/513596",
			peerReviewed: true,
			checkedAgainst: "arXiv astro-ph/0702324; University of Arizona portal"
		},
		{
			key: "otten2017",
			authors: [
				"Otten, G. P. P. L.",
				"Snik, F.",
				"Kenworthy, M. A.",
				"Keller, C. U.",
				"Males, J. R.",
				"Morzinski, K. M.",
				"Close, L. M.",
				"Codona, J. L.",
				"Hinz, P. M.",
				"Hornburg, K. J.",
				"Brickson, L. L.",
				"Escuti, M. J."
			],
			year: 2017,
			title: "On-sky performance analysis of the vector apodizing phase plate coronagraph on MagAO/Clio2",
			journal: "The Astrophysical Journal",
			volume: "834",
			pages: "175",
			doi: "10.3847/1538-4357/834/2/175",
			peerReviewed: true,
			checkedAgainst: "Duke Scholars; arXiv 1702.04193"
		},
		{
			key: "guyon2003",
			authors: ["Guyon, O."],
			year: 2003,
			title: "Phase-induced amplitude apodization of telescope pupils for extrasolar terrestrial planet imaging",
			journal: "Astronomy & Astrophysics",
			volume: "404",
			pages: "379–387",
			doi: "10.1051/0004-6361:20030457",
			peerReviewed: true,
			checkedAgainst: "A&A article page; arXiv astro-ph/0301190"
		},
		{
			key: "sivaramakrishnan2001",
			authors: [
				"Sivaramakrishnan, A.",
				"Koresko, C. D.",
				"Makidon, R. B.",
				"Berkefeld, T.",
				"Kuchner, M. J."
			],
			year: 2001,
			title: "Ground-based coronagraphy with high-order adaptive optics",
			journal: "The Astrophysical Journal",
			volume: "552",
			pages: "397–408",
			doi: "10.1086/320444",
			peerReviewed: true,
			checkedAgainst: "arXiv astro-ph/0103012; published article header"
		},
		{
			key: "soummer2007",
			authors: [
				"Soummer, R.",
				"Pueyo, L.",
				"Sivaramakrishnan, A.",
				"Vanderbei, R. J."
			],
			year: 2007,
			title: "Fast computation of Lyot-style coronagraph propagation",
			journal: "Optics Express",
			volume: "15",
			pages: "15935–15951",
			doi: "10.1364/OE.15.015935",
			peerReviewed: true,
			checkedAgainst: "Optica article page; PubMed 19550881; arXiv 0711.0368"
		},
		{
			key: "platt2001",
			authors: ["Platt, B. C.", "Shack, R."],
			year: 2001,
			title: "History and principles of Shack–Hartmann wavefront sensing",
			journal: "Journal of Refractive Surgery",
			volume: "17",
			pages: "S573–S577",
			doi: "10.3928/1081-597X-20010901-13",
			peerReviewed: true,
			checkedAgainst: "PubMed 11583233; library catalog record"
		},
		{
			key: "ragazzoni1996",
			authors: ["Ragazzoni, R."],
			year: 1996,
			title: "Pupil plane wavefront sensing with an oscillating prism",
			journal: "Journal of Modern Optics",
			volume: "43",
			pages: "289–293",
			doi: "10.1080/09500349608232742",
			peerReviewed: true,
			checkedAgainst: "Taylor & Francis abstract URL; Crossref-format reference lists"
		},
		{
			key: "ndiaye2013",
			authors: [
				"N'Diaye, M.",
				"Dohlen, K.",
				"Fusco, T.",
				"Paul, B."
			],
			year: 2013,
			title: "Calibration of quasi-static aberrations in exoplanet direct-imaging instruments with a Zernike phase-mask sensor",
			journal: "Astronomy & Astrophysics",
			volume: "555",
			pages: "A94",
			doi: "10.1051/0004-6361/201219797",
			peerReviewed: true,
			checkedAgainst: "A&A article page; arXiv 1305.5143"
		},
		{
			key: "roddier1988",
			authors: ["Roddier, F."],
			year: 1988,
			title: "Curvature sensing and compensation: a new concept in adaptive optics",
			journal: "Applied Optics",
			volume: "27",
			pages: "1223–1225",
			doi: "10.1364/AO.27.001223",
			peerReviewed: true,
			checkedAgainst: "Optica abstract page ao-27-7-1223"
		},
		{
			key: "gonsalves1982",
			authors: ["Gonsalves, R. A."],
			year: 1982,
			title: "Phase retrieval and diversity in adaptive optics",
			journal: "Optical Engineering",
			volume: "21",
			pages: "829–832",
			doi: "10.1117/12.7972989",
			peerReviewed: true,
			checkedAgainst: "Scilit; independent reference lists (Opt. Eng. 21, 829–832)"
		},
		{
			key: "baudoz2006",
			authors: [
				"Baudoz, P.",
				"Boccaletti, A.",
				"Baudrand, J.",
				"Rouan, D."
			],
			year: 2006,
			title: "The self-coherent camera: a new tool for planet detection",
			journal: "Proceedings of IAU Colloquium 200, Direct Imaging of Exoplanets: Science & Techniques",
			volume: "200",
			pages: "553–558",
			doi: "10.1017/S174392130600994X",
			peerReviewed: false,
			checkedAgainst: "Cambridge PDF first page; ADS"
		},
		{
			key: "galicher2010",
			authors: [
				"Galicher, R.",
				"Baudoz, P.",
				"Rousset, G.",
				"Totems, J.",
				"Mas, M."
			],
			year: 2010,
			title: "Self-coherent camera as a focal plane wavefront sensor: simulations",
			journal: "Astronomy & Astrophysics",
			volume: "509",
			pages: "A31",
			doi: "10.1051/0004-6361/200912902",
			peerReviewed: true,
			checkedAgainst: "A&A article page; arXiv 0911.2465"
		},
		{
			key: "borde2006",
			authors: ["Bordé, P. J.", "Traub, W. A."],
			year: 2006,
			title: "High-contrast imaging from space: speckle nulling in a low-aberration regime",
			journal: "The Astrophysical Journal",
			volume: "638",
			pages: "488–498",
			doi: "10.1086/498669",
			peerReviewed: true,
			checkedAgainst: "arXiv astro-ph/0510597 journal reference and DOI"
		},
		{
			key: "trauger2007",
			authors: ["Trauger, J. T.", "Traub, W. A."],
			year: 2007,
			title: "A laboratory demonstration of the capability to image an Earth-like extrasolar planet",
			journal: "Nature",
			volume: "446",
			pages: "771–773",
			doi: "10.1038/nature05729",
			peerReviewed: true,
			checkedAgainst: "Nature article page; Springer reference entries"
		},
		{
			key: "giveon2007",
			authors: [
				"Give'on, A.",
				"Belikov, R.",
				"Shaklan, S.",
				"Kasdin, J."
			],
			year: 2007,
			title: "Closed loop, DM diversity-based, wavefront correction algorithm for high contrast imaging systems",
			journal: "Optics Express",
			volume: "15",
			pages: "12338–12343",
			doi: "10.1364/OE.15.012338",
			peerReviewed: true,
			checkedAgainst: "Optica article page; Princeton research portal"
		},
		{
			key: "groff2016",
			authors: [
				"Groff, T. D.",
				"Riggs, A. J. E.",
				"Kern, B.",
				"Kasdin, N. J."
			],
			year: 2016,
			title: "Methods and limitations of focal plane sensing, estimation, and control in high-contrast imaging",
			journal: "Journal of Astronomical Telescopes, Instruments, and Systems",
			volume: "2",
			pages: "011009",
			doi: "10.1117/1.JATIS.2.1.011009",
			peerReviewed: true,
			checkedAgainst: "SPIE Digital Library; Princeton research portal"
		},
		{
			key: "malbet1995",
			authors: [
				"Malbet, F.",
				"Yu, J. W.",
				"Shao, M."
			],
			year: 1995,
			title: "High-dynamic-range imaging using a deformable mirror for space coronography",
			journal: "Publications of the Astronomical Society of the Pacific",
			volume: "107",
			pages: "386–398",
			doi: "10.1086/133563",
			peerReviewed: true,
			checkedAgainst: "Scilit; arXiv astro-ph/9502042"
		},
		{
			key: "guyon2005",
			authors: ["Guyon, O."],
			year: 2005,
			title: "Limits of adaptive optics for high-contrast imaging",
			journal: "The Astrophysical Journal",
			volume: "629",
			pages: "592–614",
			doi: "10.1086/431209",
			peerReviewed: true,
			checkedAgainst: "arXiv astro-ph/0505086 journal reference and DOI"
		},
		{
			key: "guyon2006",
			authors: [
				"Guyon, O.",
				"Pluzhnik, E. A.",
				"Kuchner, M. J.",
				"Collins, B.",
				"Ridgway, S. T."
			],
			year: 2006,
			title: "Theoretical limits on extrasolar terrestrial planet detection with coronagraphs",
			journal: "The Astrophysical Journal Supplement Series",
			volume: "167",
			pages: "81–99",
			doi: "10.1086/507630",
			peerReviewed: true,
			checkedAgainst: "Crossref-sourced library record; arXiv astro-ph/0608506"
		},
		{
			key: "noll1976",
			authors: ["Noll, R. J."],
			year: 1976,
			title: "Zernike polynomials and atmospheric turbulence",
			journal: "Journal of the Optical Society of America",
			volume: "66",
			pages: "207–211",
			doi: "10.1364/JOSA.66.000207",
			peerReviewed: true,
			checkedAgainst: "doi.org landing page (search result); Scilit"
		},
		{
			key: "por2018",
			authors: [
				"Por, E. H.",
				"Haffert, S. Y.",
				"Radhakrishnan, V. M.",
				"Doelman, D. S.",
				"van Kooten, M.",
				"Bos, S. P."
			],
			year: 2018,
			title: "High Contrast Imaging for Python (HCIPy): an open-source adaptive optics and coronagraph simulator",
			journal: "Proceedings of SPIE, Adaptive Optics Systems VI",
			volume: "10703",
			pages: "1070342",
			doi: "10.1117/12.2314407",
			peerReviewed: false,
			checkedAgainst: "SPIE Digital Library page"
		}
	];
	/** Full citation text, without the DOI link. */
	function fullCite(r) {
		return `${r.authors.length > 6 ? `${r.authors.slice(0, 6).join(", ")}, et al.` : r.authors.join(", ")} ${r.year}, “${r.title}”, ${r.journal} ${r.volume}, ${r.pages}.`;
	}
	// src/content/sensorInfo.ts
	var R$1 = String.raw;
	var SENSOR_INFO = [
		{
			id: "shack-hartmann",
			name: "Shack–Hartmann sensor",
			family: "Pupil plane",
			beginner: "An array of tiny lenses cuts the beam into small pieces and focuses each one into a spot. If the wavefront is tilted over a piece, its spot moves. The pattern of spot shifts tells the system how the wavefront is bent.",
			expert: [R$1`Each lenslet of width $d$ forms a spot whose centroid moves by $f\,\langle\partial W/\partial x\rangle$: the average wavefront slope over the subaperture. A linear reconstructor (here the pseudo-inverse of a measured interaction matrix) turns the slopes into modal coefficients. The sensor is linear over a wide range but its sampling sets the highest spatial frequency it can see; finer structure aliases into the measured modes. Platt & Shack (2001) recount the history and principle.`],
			formulas: [{
				note: "spot centroid of subaperture k",
				tex: R$1`\mathbf c_k=\frac{f}{A_k}\int_{A_k}\nabla W\,d^2x`
			}],
			strengths: ["Wide linear range, simple to calibrate.", "Works with extended reference sources."],
			limitations: ["Aliasing of high spatial frequencies.", "Noise spread over many pixels per subaperture."],
			instruments: [
				"VLT/SPHERE (SAXO)",
				"Gemini Planet Imager",
				"Keck AO"
			],
			refs: ["platt2001"],
			sim: "8 × 8 subapertures by default; each spot is an FFT of the subaperture field padded 4×; noiseless detector."
		},
		{
			id: "pyramid",
			name: "Pyramid sensor",
			family: "Pupil plane",
			beginner: "A four-sided glass pyramid sits at the focus and splits the star image into four parts, each making its own picture of the pupil. How light is shared between the four pictures shows the slope of the wavefront at every point.",
			expert: [R$1`Ragazzoni (1996) introduced the oscillating-prism sensor: the pyramid acts as a set of knife edges, and the normalised differences of the four pupil images measure the local wavefront slope. Without modulation the sensor is very sensitive but saturates for errors beyond about a radian; circular modulation of the beam around the apex (radius $r_\mathrm{mod}$) trades sensitivity for linear range.`],
			formulas: [{
				note: "slope signals from the four pupil images",
				tex: R$1`S_x=\frac{I_2+I_4-I_1-I_3}{\langle I\rangle},\qquad S_y=\frac{I_3+I_4-I_1-I_2}{\langle I\rangle}`
			}],
			strengths: ["Higher sensitivity than the Shack–Hartmann for the same light.", "Adjustable gain and range through modulation."],
			limitations: ["Non-linear and with optical gains that change with the residual.", "Needs precise alignment of the pupil images."],
			instruments: [
				"LBT/FLAO",
				"Magellan/MagAO",
				"Subaru/SCExAO",
				"Keck/NIRC2 pyramid WFS"
			],
			refs: ["ragazzoni1996"],
			sim: "Pupil binned to 32 px, 4× padded FFTs, apex between samples, modulation averaged over at least 8 points."
		},
		{
			id: "zernike",
			name: "Zernike phase-contrast sensor",
			family: "Pupil plane",
			beginner: "A tiny bump in the focal plane delays the centre of the star image by a quarter wavelength. That small part acts as a reference that interferes with the rest of the beam, so invisible phase errors turn into a visible pattern of light and dark in the pupil image.",
			expert: [R$1`Zernike's phase-contrast principle applied to coronagraphy (N'Diaye et al. 2013, ZELDA): a focal dimple of diameter ≈1.06 $\lambda/D$ and phase $\theta=\pi/2$ creates a reference wave of amplitude $b$. The pupil intensity is $I=P^2+2b^2(1-\cos\theta)+2Pb[\sin\phi\sin\theta-\cos\phi(1-\cos\theta)]$, linear in $\phi$ for small errors, so a single image measures the phase map with very high sensitivity. It is used to calibrate slowly varying non-common-path aberrations.`],
			formulas: [{
				note: "pupil intensity (N’Diaye et al. 2013)",
				tex: R$1`I=P^2+2b^2(1-\cos\theta)+2Pb\,[\sin\phi\sin\theta-\cos\phi\,(1-\cos\theta)]`
			}],
			strengths: ["Near the fundamental sensitivity limit.", "Simple: one small mask and one image."],
			limitations: ["Small capture range (phase ≲ 0.5 rad).", "Chromatic dimple phase."],
			instruments: ["VLT/SPHERE (ZELDA)", "Roman Coronagraph low-order sensor"],
			refs: ["ndiaye2013"],
			sim: "Babinet/MFT propagation through the dimple; linear reconstruction from a measured interaction matrix."
		},
		{
			id: "curvature",
			name: "Curvature sensor",
			family: "Pupil plane",
			beginner: "Two slightly out-of-focus images of the star are taken, one before and one after focus. Where the wavefront is curved, light bunches up in one image and spreads out in the other. Their difference maps the curvature of the wavefront.",
			expert: [R$1`Roddier (1988): by conservation of energy (the transport-of-intensity equation) the normalised difference of the intra- and extra-focal images is proportional to the wavefront Laplacian inside the pupil and to the radial slope at its edge. That signal can drive a bimorph or membrane mirror almost directly. The defocus distance sets the gain and the smallest scale seen.`],
			formulas: [{
				note: "curvature signal (dimensionless distance z′ = λz/D²)",
				tex: R$1`\frac{I_+-I_-}{I_++I_-}\propto z'\left(\nabla^2W-\frac{\partial W}{\partial n}\,\delta_{\rm edge}\right)`
			}],
			strengths: ["Simple optics, high sensitivity at low order.", "Natural match to bimorph mirrors."],
			limitations: ["Sensitivity drops for high spatial orders.", "Needs a vibrating membrane or two detectors."],
			instruments: [
				"Subaru AO188",
				"CFHT/PUEO",
				"VLT/MACAO"
			],
			refs: ["roddier1988"],
			sim: "Fresnel propagation of the pupil field by ±z (angular spectrum, 2× padded FFT)."
		},
		{
			id: "pairwise",
			name: "Pairwise DM probing",
			family: "Focal plane",
			beginner: "The deformable mirror adds small known ripples (\"probes\") that make extra light in the dark hole. Comparing pictures with the ripple pushed and pulled reveals the hidden electric field of the starlight, which the mirror can then cancel.",
			expert: [R$1`For a probe field $\Delta E_k$ predicted by the model, $I_k^+-I_k^-=|E+\Delta E_k|^2-|E-\Delta E_k|^2=4\,\mathrm{Re}(E^*\Delta E_k)$. Two or more probe pairs give, at each pixel, a least-squares problem for $(\mathrm{Re}\,E,\mathrm{Im}\,E)$. This estimator feeds EFC (Give'on et al. 2007; Groff et al. 2016). The probe amplitude is matched to the current contrast.`],
			formulas: [{
				note: "difference of a probe pair",
				tex: R$1`I_k^+-I_k^-=4\,\mathrm{Re}\!\left(E^{*}\,\Delta E_k\right)`
			}],
			strengths: ["Measures the field in the science image itself, NCPA included.", "Needs only the existing DM."],
			limitations: ["Relies on a model of the probe fields.", "2K + 1 images per estimate."],
			instruments: ["JPL High Contrast Imaging Testbed", "Roman Coronagraph"],
			refs: ["giveon2007", "groff2016"],
			sim: "Three sinc–sinc–cosine probes, monochromatic at λ0; probe fields from the model Jacobian."
		},
		{
			id: "phase-diversity",
			name: "Phase diversity",
			family: "Focal plane",
			beginner: "Two images of the star are taken, one in focus and one deliberately defocused by a known amount. A computer then finds the wavefront errors that would produce exactly those two images.",
			expert: [R$1`Gonsalves (1982): a single focal image does not determine the phase (even modes have a sign ambiguity), but a second image with a known extra phase $\theta_d$ (here defocus) does. The unknown coefficients are fitted by non-linear least squares, $\min\sum_k\|I_k-|\mathcal F\{P e^{i(\phi+\theta_k)}\}|^2\|^2$. It measures what the science camera sees, so it is used to calibrate non-common-path aberrations.`],
			formulas: [{
				note: "fitted model",
				tex: R$1`I_k(\mathbf u)=\left|\mathcal F\{P\,e^{\,i(\phi+\theta_k)}\}\right|^2,\quad \theta_0=0,\ \theta_1=\theta_d\,Z_4`
			}],
			strengths: ["Uses the science camera: sees NCPA.", "No extra optics."],
			limitations: ["Iterative and model-dependent.", "Needs the coronagraph mask out of the beam (or an off-axis source)."],
			instruments: ["JWST wavefront sensing (defocused images)", "NCPA calibration on VLT/SPHERE"],
			refs: ["gonsalves1982"],
			sim: "Gauss–Newton (Levenberg–Marquardt) fit of Noll 2–11 to two images at Nyquist sampling."
		},
		{
			id: "scc",
			name: "Self-coherent camera (SCC)",
			family: "Focal plane",
			beginner: "A tiny extra hole in the Lyot stop lets a little of the blocked starlight through. It interferes with the leftover starlight on the camera and draws fine fringes on it. Planet light does not form fringes, and the fringes reveal the starlight field directly.",
			expert: [R$1`Baudoz et al. (2006) and Galicher et al. (2010): with a reference hole at distance $\xi_0$, the image is $|E_S|^2+|E_R|^2+2\,\mathrm{Re}(E_S E_R^*)$ with fringes of period $\lambda/\xi_0$. In the Fourier transform of the image the cross term sits apart if $\xi_0>D(1.5+d/2D)$; filtering it and dividing by the known reference field gives $E_S$ from one image. Light from a planet is incoherent with the star and makes no fringes.`],
			formulas: [{
				note: "fringed image",
				tex: R$1`I=|E_S|^2+|E_R|^2+2\,\mathrm{Re}\{E_S\,E_R^{*}\},\quad E_R\propto e^{-2\pi i\,\xi_0 u}`
			}],
			strengths: ["Field estimate from a single image.", "Also separates star and planet light."],
			limitations: ["Fine detector sampling needed (q > 2(ξ0 + D/2)).", "Reference hole must catch starlight: needs a focal mask and a Lyot stop."],
			instruments: ["THD2 testbed, Paris Observatory"],
			refs: ["baudoz2006", "galicher2010"],
			sim: "Hole at 1.65 D, diameter 0.08 D; image sampled at 6 px per λ/D; side-band filtered with MFTs."
		}
	];
	var CONTROL_INFO = [
		{
			id: "ao",
			name: "Adaptive-optics integrator",
			family: "Control (pupil-plane sensors)",
			beginner: "The sensor measures the wavefront, the computer works out how to bend the deformable mirror, and the mirror moves a fraction of the way. Repeating this many times flattens the wavefront.",
			expert: [R$1`The interaction matrix $D$ (sensor response to each DM mode) is measured by push–pull; its regularised pseudo-inverse $R$ gives modal coefficients; the integrator applies $a_{k+1}=a_k-g\,M R\,(s_k-s_\mathrm{ref})$. The loop cannot correct structure finer than its modes (fitting error) and is blind to non-common-path aberrations; Guyon (2005) discusses the limits of AO for high contrast.`],
			formulas: [{
				note: "integrator",
				tex: R$1`a_{k+1}=a_k-g\,M\,R\,(s_k-s_{\rm ref}),\quad R=(D^{T}D+\alpha I)^{-1}D^{T}`
			}],
			strengths: ["Fast and robust."],
			limitations: ["Fitting and aliasing errors; blind to NCPA."],
			instruments: ["Every AO system"],
			refs: ["guyon2005", "noll1976"],
			sim: "30 Zernike modes fitted by the DM, gain chosen by the user."
		},
		{
			id: "efc",
			name: "Electric field conjugation (EFC)",
			family: "Control (focal plane)",
			beginner: "Once the starlight field in the dark hole is known, the computer finds the mirror shape that creates the opposite field, so the two cancel. Repeating digs the hole deeper.",
			expert: [R$1`With the Jacobian $G=\partial E/\partial a$ of the model, EFC solves the regularised least-squares problem $\min\|E+G\,\delta a\|^2+\alpha\|\delta a\|^2$ (Give'on et al. 2007). A single DM can correct phase and amplitude errors in a half dark hole; Malbet et al. (1995) introduced the dark-hole idea, and Trauger & Traub (2007) reached $6\times10^{-10}$ in the laboratory.`],
			formulas: [{
				note: "EFC update",
				tex: R$1`\delta a=-(G^{T}G+\alpha\,I)^{-1}G^{T}E,\qquad G=\begin{bmatrix}\mathrm{Re}\,J\\ \mathrm{Im}\,J\end{bmatrix}`
			}],
			strengths: ["Fast convergence; corrects amplitude and phase."],
			limitations: ["Needs an accurate model and a field estimate."],
			instruments: ["JPL HCIT", "Roman Coronagraph"],
			refs: [
				"giveon2007",
				"malbet1995",
				"trauger2007"
			],
			sim: "Jacobian from the unaberrated model, one propagation per actuator, monochromatic at λ0."
		},
		{
			id: "speckle-nulling",
			name: "Speckle nulling",
			family: "Control (focal plane)",
			beginner: "The brightest spots of leftover starlight are attacked one at a time: the mirror adds a ripple that makes a matching spot, the computer tries a few positions of the ripple, and then sets it to cancel the speckle.",
			expert: [R$1`Bordé & Traub (2006): a DM sine wave of spatial frequency $\mathbf u$ adds a field $B e^{i(\varphi+\beta)}$ at the speckle. Four images with $\varphi=0,\pi/2,\pi,3\pi/2$ give $I(\varphi)=|E|^2+B^2+2|E|B\cos(\varphi-\psi)$, from which the phase $\psi$ and the amplitude ratio follow; the cancelling sine has phase $\psi+\pi$ and amplitude $|E|/B$ times the probe. No model is needed.`],
			formulas: [{
				note: "intensity versus probe phase",
				tex: R$1`I(\varphi)=|E|^2+B^2+2|E|B\cos(\varphi-\psi)`
			}],
			strengths: ["Model-free, robust."],
			limitations: ["Slow: a few speckles per iteration, several images each."],
			instruments: ["Early dark-hole testbeds; Palomar and Subaru speckle control"],
			refs: ["borde2006", "malbet1995"],
			sim: "Six well-separated speckles per iteration, probe amplitude scaled with the contrast."
		}
	];
	// src/site/helpTopics.ts
	/** Theory topics for the parameters and panels, and the short tooltips. */
	var R = String.raw;
	var PARAMETER_TOPICS = {
		basics: {
			title: "Basics: how to read this lab",
			what: "A coronagraph is an instrument inside a telescope that removes the light of a star so that much fainter planets next to it can be seen. This lab follows the light through every element and shows how each one changes it.",
			theory: [
				R`Light from the star and the planet enters the telescope, passes a pupil plane ({{planes|plane A}}) where an apodizer or phase plate may sit, reflects off a {{dm|deformable mirror}}, is split towards a {{sensors|wavefront sensor}}, comes to a focus where a {{coronagraphs|focal-plane mask}} acts (B), reaches a second pupil image where the {{lyotstop|Lyot stop}} blocks diffracted starlight (C), and is finally imaged on the {{image|detector}} (D).`,
				R`Angles are in units of $\lambda/D$, the diffraction scale of the telescope. Brightness is in {{contrast|raw contrast}}: the fraction of a planet's peak brightness that the leftover starlight reaches.`,
				R`The Beginner mode offers a guided tour and a few controls. The Expert mode exposes every parameter, log or linear images, phase maps, curves and data export.`
			],
			formulas: [{
				note: "Fraunhofer propagation between pupil and focal planes",
				tex: R`E_{\rm focal}(\mathbf u)=\int E_{\rm pupil}(\mathbf x)\,e^{-2\pi i\,\mathbf u\cdot\mathbf x}\,d^2x`
			}],
			sim: R`Scalar Fraunhofer optics with FFTs and matrix Fourier transforms; see {{numerics|the numerical method}}.`,
			refs: ["guyon2006", "por2018"],
			see: [
				"planes",
				"contrast",
				"coronagraphs",
				"sensors",
				"loop"
			]
		},
		coronagraphs: {
			title: "Families of coronagraphs",
			what: "Coronagraphs either block or reshape the starlight with amplitude masks (Lyot, APLC, band-limited, shaped pupil) or change its phase so that it cancels itself (Roddier, four-quadrant, vortex, apodizing phase plate).",
			theory: [R`They are judged by the depth of the starlight suppression (raw contrast), the inner working angle (how close to the star a planet survives), the throughput for planet light, the robustness to aberrations and the bandwidth. Guyon et al. (2006) compared many designs against the fundamental limits set by the stellar diameter and the wave nature of light.`],
			formulas: [{
				note: "generic Lyot-type coronagraph",
				tex: R`E_D=\mathcal F\{L\cdot\mathcal F^{-1}\{M\cdot\mathcal F\{A\cdot E_{\rm pupil}\}\}\}`
			}],
			sim: "Choose the design in the Coronagraph menu; each has its own info panel.",
			refs: ["guyon2006"],
			see: [
				"lyot",
				"aplc",
				"bandlimited",
				"shaped",
				"roddier",
				"fqpm",
				"vortex",
				"app"
			]
		},
		sensors: {
			title: "Wavefront sensors",
			what: "A wavefront sensor turns invisible phase errors into intensities a camera can measure. Pupil-plane sensors work in a separate arm after a beam splitter; focal-plane methods use the science camera itself.",
			theory: [R`Pupil-plane sensors (Shack–Hartmann, pyramid, Zernike, curvature) are fast and drive the adaptive-optics loop, but they cannot see the non-common-path aberrations of the science arm. Focal-plane methods (pairwise probing, phase diversity, self-coherent camera) measure what the coronagraph actually lets through, which is what a dark hole needs.`],
			formulas: [{
				note: "linear reconstruction from a calibrated interaction matrix D",
				tex: R`\hat c=(D^{T}D+\alpha I)^{-1}D^{T}(s-s_{\rm ref})`
			}],
			sim: "Each sensor is calibrated by pushing and pulling the DM modes; the panel shows its raw signal and its estimate against the truth.",
			refs: ["guyon2005"],
			see: [
				"shack-hartmann",
				"pyramid",
				"zernike",
				"curvature",
				"pairwise",
				"phase-diversity",
				"scc",
				"ncpa"
			]
		},
		planes: {
			title: "The optical train and its planes",
			what: "Click a plane in the diagram, or a card below it, to see the light before and after that element at a large size.",
			theory: [R`Planes A and C are images of the telescope pupil; planes B and D are images of the sky. Going from a pupil plane to a focal plane is a Fourier transform. The starlight is drawn in orange and the planet light in blue; the planet focuses a little off-centre and so misses the focal-plane mask.`],
			formulas: [{
				note: "pupil ↔ focal plane",
				tex: R`E_B=\mathcal F\{E_A\},\qquad E_C=\mathcal F^{-1}\{M\,E_B\}`
			}],
			sim: "Thumbnails show the on-axis star at the central wavelength. In Expert mode they also show the phase.",
			refs: ["soummer2007"],
			see: ["coronagraphs", "lyotstop"]
		},
		image: {
			title: "The detector image",
			what: "The final image: the leftover starlight plus the planets, in raw-contrast units. The logarithmic scale shows many factors of ten at once.",
			theory: [R`Each image is normalised to the peak of an off-axis source seen through the same instrument without its focal-plane mask, so a planet of flux ratio $10^{-6}$ peaks near $10^{-6}$ (times its throughput). Colour maps are perceptually uniform and readable with colour-vision deficiencies.`],
			formulas: [{
				note: "image of star and planets",
				tex: R`I=|E_\star|^2+\sum_p f_p\,|E_p|^2`
			}],
			sim: "In broadband mode the image sums several wavelengths incoherently.",
			refs: ["guyon2006"],
			see: ["contrast", "noise"]
		},
		contrast: {
			title: "Raw contrast curve",
			what: "How bright the leftover starlight is, averaged in rings around the star, compared with the bare telescope. Lower is better: a planet is visible where its flux ratio is above this curve.",
			theory: [R`The curve averages the normalised star image over annuli, restricted to the region the design is meant to darken (one side for the APP, a wedge for the shaped pupil). It is a "raw" contrast: no post-processing.`],
			formulas: [{
				note: "raw contrast at separation r",
				tex: R`C(r)=\frac{\langle I_\star(\mathbf u)\rangle_{|\mathbf u|=r}}{I_{\rm off\text{-}axis}(0)}`
			}],
			sim: "Bin width 0.5 λ/D; the dashed curve is the bare telescope with the same errors.",
			refs: ["guyon2006", "malbet1995"],
			see: ["throughput", "darkhole"]
		},
		throughput: {
			title: "Planet throughput and inner working angle",
			what: "How much of a planet’s light survives the coronagraph as a function of its distance from the star. The inner working angle (IWA) is where it reaches half of its maximum.",
			theory: [R`Core throughput: the energy of the planet image within 0.7 $\lambda/D$ of its centre, divided by the same quantity for the bare telescope. Masks block planets near the star; designs without a focal mask (shaped pupil, APP) do not dim the planet, and their IWA is the inner edge of their dark zone.`],
			formulas: [{
				note: "core throughput",
				tex: R`T(s)=\frac{\int_{|\mathbf u-\mathbf s|<0.7}I_p\,d^2u}{\int_{|\mathbf u-\mathbf s|<0.7}I_{p,\rm bare}\,d^2u}`
			}],
			sim: "Computed on request (it takes one propagation per separation).",
			refs: ["guyon2006", "mawet2005"],
			see: ["contrast"]
		},
		pupil: {
			title: "Telescope pupil",
			what: "The shape of the light-collecting mirror as seen by the light: a clear circle, a circle with a central obstruction and spider vanes, or a mosaic of hexagonal segments.",
			theory: [R`Obstructions, vanes and segment gaps diffract light into spikes and rings that many coronagraphs cannot remove: the vortex and four-quadrant nulls, for example, require a clear circular pupil. The APLC and APP can be designed for any shape.`],
			formulas: [{
				note: "image of the pupil P",
				tex: R`I(\mathbf u)=|\mathcal F\{P\}|^2`
			}],
			sim: "Edges are supersampled 4 × 4; the Lyot stop of a segmented pupil is its inscribed circle.",
			refs: ["soummer2005"],
			see: ["lyotstop"]
		},
		wavelength: {
			title: "Wavelength and bandwidth",
			what: "All angles scale with wavelength: the same mask is effectively smaller in λ/D at longer wavelengths, and aberrations of fixed height are smaller in waves.",
			theory: [R`Broadband images are the incoherent sum of several wavelengths. Fixed physical masks (Lyot, band-limited, Roddier) and the classical APP are chromatic; the vortex, the four-quadrant mask (in this idealised model) and the vector APP use a geometric phase that does not depend on wavelength.`],
			formulas: [{
				note: "phase of an optical path error W",
				tex: R`\phi=\frac{2\pi}{\lambda}W`
			}],
			sim: "Uniform samples over λ0(1 ± Δλ/2λ0); control loops use λ0 only.",
			refs: ["kuchner2002", "otten2017"],
			see: ["app", "bandlimited"]
		},
		aberrations: {
			title: "Aberrations",
			what: "Small errors in the shape of the optics. Each nanometre of error scatters starlight into speckles that look like planets.",
			theory: [R`Low-order errors are described by Zernike polynomials (Noll's normalisation: the coefficient is the RMS of the mode). Polishing errors at all scales are modelled by a random phase screen with a power-law spectrum $\propto f^{-\alpha}$. A phase error of spatial frequency $f$ cycles per pupil puts a pair of speckles at $\pm f\,\lambda/D$, with an intensity $\approx(\pi a/\lambda)^2$ for a ripple of amplitude $a$ (Malbet et al. 1995).`],
			formulas: [{
				note: "wavefront",
				tex: R`W(\mathbf x)=\sum_j c_j Z_j(\mathbf x)+W_{\rm screen}(\mathbf x)`
			}],
			sim: "Screens are drawn with a fixed seed; amplitude errors use a flatter spectrum.",
			refs: ["noll1976", "malbet1995"],
			see: ["ncpa", "sensors"]
		},
		ncpa: {
			title: "Non-common-path aberrations (NCPA)",
			what: "Errors located after the beam splitter, in the science arm only. The pupil-plane wavefront sensor never sees them.",
			theory: [R`Because the AO loop flattens the wavefront seen by its own sensor, NCPA survive as slowly varying "quasi-static" speckles, a major limit of ground-based coronagraphs. Focal-plane methods (phase diversity, Zernike sensor calibration, pairwise probing with EFC, the SCC) measure them in the science image.`],
			formulas: [{
				note: "what each arm sees",
				tex: R`W_{\rm sci}=W_{\rm common}+W_{\rm NCPA}+W_{\rm DM},\qquad W_{\rm WFS}=W_{\rm common}+W_{\rm DM}`
			}],
			sim: "NCPA are added only to the science-arm OPD.",
			refs: ["ndiaye2013", "galicher2010"],
			see: ["phase-diversity", "pairwise"]
		},
		planets: {
			title: "Planets",
			what: "Off-axis point sources at a separation (λ/D), position angle and flux ratio. Their light is incoherent with the star, so their images add in intensity.",
			theory: [R`A planet at angle $\mathbf s$ is a tilted plane wave in the pupil: $E_p=P\,e^{2\pi i\,\mathbf s\cdot\mathbf x}$. Its image passes the coronagraph with the throughput of the design at that separation.`],
			formulas: [{
				note: "tilted wave",
				tex: R`E_p(\mathbf x)=P(\mathbf x)\,e^{i\phi(\mathbf x)}\,e^{2\pi i\,\mathbf s\cdot\mathbf x}`
			}],
			sim: "Up to three planets; flux ratios from 1e-10 to 1e-2.",
			refs: ["guyon2006"],
			see: ["throughput"]
		},
		dm: {
			title: "Deformable mirror",
			what: "A thin mirror pushed by a grid of actuators that can change its shape by nanometres to cancel the wavefront errors.",
			theory: [R`An $N\times N$ actuator mirror controls spatial frequencies up to $N/2$ cycles per pupil, so it can clean a dark hole out to $N/2$ $\lambda/D$. Each actuator pushes a smooth bump (Gaussian influence function); the coupling is the response at the neighbouring actuator.`],
			formulas: [{
				note: "influence function",
				tex: R`h_k(\mathbf x)=\exp\left[\ln c\,\frac{|\mathbf x-\mathbf x_k|^2}{p^2}\right]`
			}],
			sim: "Commands are in nm of wavefront.",
			refs: ["malbet1995"],
			see: ["darkhole", "loop"]
		},
		darkhole: {
			title: "Dark hole",
			what: "The region of the image where the deformable mirror is asked to remove the starlight.",
			theory: [R`Malbet et al. (1995) proposed using a DM to dig such "dark holes". With one DM, both the amplitude and phase of the speckle field can be cancelled in half of the field (a one-sided hole); a full annulus can be corrected only for phase errors.`],
			formulas: [{
				note: "mean contrast in the hole H",
				tex: R`C_H=\frac{1}{|H|}\sum_{\mathbf u\in H}|E(\mathbf u)|^2`
			}],
			sim: "Sampled at 2 pixels per λ/D at λ0.",
			refs: [
				"malbet1995",
				"giveon2007",
				"trauger2007"
			],
			see: [
				"efc",
				"speckle-nulling",
				"pairwise"
			]
		},
		loop: {
			title: "Closed-loop control",
			what: "Measure, correct, repeat. Each iteration updates the deformable mirror from the latest measurement; the plots show the contrast and the wavefront error after each step.",
			theory: [R`Pupil-plane sensors drive a modal integrator (the AO loop). The science camera drives speckle nulling or EFC, which dig a dark hole and also correct the NCPA. The loop gain sets how much of each correction is applied.`],
			formulas: [{
				note: "integrator",
				tex: R`a_{k+1}=a_k+g\,\Delta a_k`
			}],
			sim: "Up to 30 iterations per run; the DM state persists until reset.",
			refs: ["giveon2007", "borde2006"],
			see: [
				"ao",
				"efc",
				"speckle-nulling"
			]
		},
		lyotstop: {
			title: "Lyot stop",
			what: "A mask in the image of the pupil (plane C) that blocks the starlight diffracted to the pupil edges by the focal-plane mask.",
			theory: [R`Undersizing the stop removes more starlight but also more planet light and degrades resolution. Its central block and vane widths must cover the obstruction and spiders of the pupil.`],
			formulas: [{
				note: "after the stop",
				tex: R`E_C'=L\cdot E_C`
			}],
			sim: "Diameter and central block are adjustable in Expert mode.",
			refs: ["lyot1939", "sivaramakrishnan2001"],
			see: ["lyot", "vortex"]
		},
		noise: {
			title: "Detector noise",
			what: "Photon noise (the random arrival of photons) and read noise of the detector.",
			theory: [R`Counts in a pixel follow a Poisson law of mean $N_0 I$ (with $N_0$ photons in the off-axis PSF peak), plus Gaussian read noise. Faint planets need enough photons to rise above the noise of the leftover starlight.`],
			formulas: [{
				note: "counts",
				tex: R`n\sim\mathrm{Poisson}(N_0 I)+\mathcal N(0,\sigma_{\rm RN}^2)`
			}],
			sim: "Only the science image is noisy; the wavefront sensors are noiseless.",
			refs: ["guyon2005"],
			see: ["image"]
		},
		numerics: {
			title: "Numerical method and limits",
			what: "How the lab computes the light, and what it leaves out.",
			theory: [R`Pupil grids have 64 (or 128) samples across $D$. Focal planes are computed with matrix Fourier transforms at any sampling (Soummer et al. 2007); compact masks use the Babinet form, the vortex and four-quadrant masks a multi-scale scheme, the band-limited mask its exact pupil-plane convolution. The physics is tested against analytic results (Airy ring, Parseval, perfect nulls, throughput) in the package's test suite.`, R`Limits: scalar, monochromatic-per-sample Fraunhofer optics; no polarisation aberrations, no atmosphere turbulence in time, no Fresnel propagation between optics, noiseless sensors, and a pixelated pupil edge that sets a contrast floor near $10^{-8}$ for the phase masks.`],
			formulas: [{
				note: "matrix Fourier transform",
				tex: R`F=W\,A_v\,E\,A_u^{T},\quad (A_u)_{kj}=e^{-2\pi i u_k x_j}`
			}],
			sim: "A comparable open-source simulator is HCIPy (Por et al. 2018).",
			refs: ["soummer2007", "por2018"],
			see: ["basics"]
		}
	};
	var TIPS = {
		pupil: "Shape of the telescope mirror: clear, obstructed with spider vanes, or hexagonal segments.",
		obsc: "Diameter of the central obstruction (secondary mirror or empty central segment).",
		spiders: "Number of vanes holding the secondary mirror.",
		spiderw: "Width of each spider vane.",
		rings: "Rings of hexagonal segments around the centre.",
		gap: "Gap between segments, as a fraction of the segment width.",
		lam: "Central wavelength λ0. Masks are defined in λ0/D.",
		band: "Width of the band of wavelengths summed in the image.",
		nlam: "Number of wavelengths sampled across the band.",
		npup: "Samples across the pupil: 128 is finer but about 4× slower.",
		fov: "Half-width of the detector image in λ0/D.",
		cor: "Which coronagraph is in the beam.",
		charge: "Number of 2π phase windings of the vortex around its centre.",
		rmask: "Radius of the focal-plane mask in λ0/D.",
		eps: "Width of the band-limited kernel; the Lyot stop shrinks by this much.",
		lyout: "Outer diameter of the Lyot stop as a fraction of the pupil.",
		lyin: "Diameter of the central block of the Lyot stop.",
		spband: "The shaped pupil concentrates the starlight within ±b λ/D along x; beyond it is dark.",
		spopen: "Number of stacked openings; more openings widen the dark zones.",
		appiwa: "Inner edge of the APP dark hole.",
		appowa: "Outer edge of the APP dark hole.",
		vapp: "Vector APP: geometric phase, the same at every wavelength, opposite in the two circular polarisations.",
		vchan: "Which polarisation channel to image.",
		vleak: "Fraction of light that leaks through without the phase pattern.",
		screen: "RMS of a random wavefront error with a power-law spectrum.",
		slope: "Steepness of the error spectrum: larger values put more error at low spatial frequencies.",
		ampl: "RMS error of the transmission (reflectivity) across the pupil.",
		ncpa: "Random errors in the science arm only, invisible to the pupil-plane sensor.",
		nplanets: "How many planets orbit the star.",
		wfs: "Which wavefront sensor measures the errors.",
		nsub: "Number of lenslets across the pupil.",
		mod: "Radius of the circular modulation around the pyramid apex.",
		zdist: "Distance of the defocused images, as λz/D².",
		modes: "Number of Zernike modes the AO loop controls.",
		ctl: "Algorithm that turns measurements into DM commands.",
		est: "How EFC learns the dark-hole field.",
		gain: "Fraction of each correction applied per iteration.",
		dhiwa: "Inner edge of the dark hole.",
		dhowa: "Outer edge of the dark hole (at most nact/2 λ/D).",
		dhhalf: "One side of the star only: lets one DM correct amplitude as well as phase.",
		alpha: "Tikhonov regularisation of EFC.",
		nact: "Number of DM actuators across the pupil.",
		coupling: "Response of an actuator’s neighbour, a fraction of its own.",
		noise: "Add photon (Poisson) and read noise to the science image.",
		photons: "Photons in the peak of an unocculted off-axis source.",
		rn: "Detector read noise in electrons.",
		"mode-beginner": "Guided tour, presets and a few controls.",
		"mode-expert": "Every parameter, phase maps, curves and data export.",
		"loop-run": "Run the control loop for the given number of iterations.",
		"loop-stop": "Stop the loop after the current iteration.",
		"loop-reset": "Flatten the deformable mirror and clear the history.",
		"tp-run": "Compute planet throughput against separation and the inner working angle.",
		"save-image": "Download the detector image as a PNG file.",
		"save-curve": "Download the contrast curve as CSV.",
		"save-tp": "Download the throughput curve as CSV.",
		"save-loop": "Download the loop history as CSV.",
		cmap: "Colour map of the images: all three are perceptually uniform and colour-blind safe.",
		scale: "Logarithmic or linear brightness scale.",
		range: "Number of factors of ten shown below the brightest value (log scale)."
	};
	// src/site/help.ts
	/**
	* Builds help.js: window.SIM_HELP for the shared explain.js (tooltips, clickable parameter names, theory dialog)
	* and window.CORONAGRAPH_LAB_CONTENT (info panels and references) for the page.
	*/
	var ref = (k) => {
		const r = REFERENCES.find((x) => x.key === k);
		return {
			c: fullCite(r),
			u: `https://doi.org/${r.doi}`
		};
	};
	function fromInfo(e, see) {
		return {
			title: e.name,
			what: e.beginner,
			theory: [
				...e.expert,
				`Strengths: ${e.strengths.join(" ")}`,
				`Limitations: ${e.limitations.join(" ")}`,
				`Used on: ${e.instruments.join("; ")}.`
			],
			formulas: e.formulas.map((f) => ({ ...f })),
			sim: e.sim,
			refs: e.refs.map(ref),
			see
		};
	}
	var topics = {};
	for (const e of CORONAGRAPH_INFO) topics[e.id] = fromInfo(e, [
		"coronagraphs",
		"contrast",
		"throughput"
	]);
	for (const e of SENSOR_INFO) topics[e.id] = fromInfo(e, ["sensors", "loop"]);
	for (const e of CONTROL_INFO) topics[e.id] = fromInfo(e, ["loop", "darkhole"]);
	for (const [k, t] of Object.entries(PARAMETER_TOPICS)) topics[k] = {
		...t,
		refs: t.refs.map(ref)
	};
	var bind = {
		pupil: "pupil",
		obsc: "pupil",
		spiders: "pupil",
		spiderw: "pupil",
		rings: "pupil",
		gap: "pupil",
		lam: "wavelength",
		band: "wavelength",
		nlam: "wavelength",
		npup: "numerics",
		fov: "numerics",
		cor: "coronagraphs",
		charge: "vortex",
		rmask: "lyot",
		eps: "bandlimited",
		lyout: "lyotstop",
		lyin: "lyotstop",
		spband: "shaped",
		spopen: "shaped",
		appiwa: "app",
		appowa: "app",
		vapp: "app",
		vchan: "app",
		vleak: "app",
		screen: "aberrations",
		slope: "aberrations",
		ampl: "aberrations",
		ncpa: "ncpa",
		nplanets: "planets",
		wfs: "sensors",
		nsub: "shack-hartmann",
		mod: "pyramid",
		zdist: "curvature",
		modes: "ao",
		ctl: "loop",
		est: "pairwise",
		gain: "loop",
		dhiwa: "darkhole",
		dhowa: "darkhole",
		dhhalf: "darkhole",
		alpha: "efc",
		nact: "dm",
		coupling: "dm",
		noise: "noise",
		photons: "noise",
		rn: "noise",
		cmap: "image",
		scale: "image",
		range: "image"
	};
	for (let j = 2; j <= 11; j++) bind[`z${j}`] = "aberrations";
	for (const j of [
		4,
		5,
		6,
		8
	]) bind[`ncpa${j}`] = "ncpa";
	for (const n of [
		1,
		2,
		3
	]) for (const s of [
		"sep",
		"pa",
		"flux"
	]) bind[`p${n}-${s}`] = "planets";
	var panels = {
		"t-train": "planes",
		"t-image": "image",
		"t-curves": "contrast",
		"t-wfs": "sensors",
		"t-loop": "loop",
		"t-read": "contrast",
		"t-controls": "basics",
		"t-info": "coronagraphs",
		"t-bib": "numerics",
		"t-tour": "basics"
	};
	var w = window;
	w.SIM_HELP = {
		tips: TIPS,
		bind,
		panels,
		topics
	};
	w.CORONAGRAPH_LAB_CONTENT = {
		coronagraphs: CORONAGRAPH_INFO,
		sensors: SENSOR_INFO,
		control: CONTROL_INFO,
		references: REFERENCES
	};
})();
