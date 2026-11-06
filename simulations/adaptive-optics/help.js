/* Explanations for the adaptive optics simulation: tooltips, and theory, formulas and references per parameter.
   Rendered by ../shared/explain.js. Strings with backslashes use String.raw so that the TeX is written as is. */
window.SIM_HELP = (() => {
  const R = String.raw;
  const ads = (code) => 'https://ui.adsabs.harvard.edu/abs/' + code.replace(/&/g, '%26');

  const FRIED = { c: 'Fried, D. L. 1966, J. Opt. Soc. Am. 56, 1372, "Optical resolution through a randomly inhomogeneous medium for very long and very short exposures"', u: ads('1966JOSA...56.1372F') };
  const NOLL = { c: 'Noll, R. J. 1976, J. Opt. Soc. Am. 66, 207, "Zernike polynomials and atmospheric turbulence"', u: ads('1976JOSA...66..207N') };
  const RODDIER81 = { c: 'Roddier, F. 1981, Progress in Optics 19, 281, "The effects of atmospheric turbulence in optical astronomy"', u: ads('1981PrOpt..19..281R') };
  const KOLM = { c: 'Kolmogorov, A. N. 1941, Dokl. Akad. Nauk SSSR 30, 301, "The local structure of turbulence in incompressible viscous fluid for very large Reynolds numbers"' };
  const TATARSKII = { c: 'Tatarskii, V. I. 1961, Wave Propagation in a Turbulent Medium, McGraw-Hill' };
  const VONKARMAN = { c: 'von Kármán, T. 1948, Proc. Natl. Acad. Sci. 34, 530, "Progress in the statistical theory of turbulence"', u: ads('1948PNAS...34..530V') };
  const TOKOVININ = { c: 'Tokovinin, A. 2002, PASP 114, 1156, "From differential image motion to seeing"', u: ads('2002PASP..114.1156T') };
  const LANE = { c: 'Lane, R. G., Glindemann, A. & Dainty, J. C. 1992, Waves in Random Media 2, 209, "Simulation of a Kolmogorov phase screen"', u: ads('1992WRM.....2..209L') };
  const TAYLOR = { c: 'Taylor, G. I. 1938, Proc. R. Soc. Lond. A 164, 476, "The spectrum of turbulence"', u: ads('1938RSPSA.164..476T') };
  const GREENWOOD = { c: 'Greenwood, D. P. 1977, J. Opt. Soc. Am. 67, 390, "Bandwidth specification for adaptive optics systems"', u: ads('1977JOSA...67..390G') };
  const HUDGIN = { c: 'Hudgin, R. H. 1977, J. Opt. Soc. Am. 67, 393, "Wave-front compensation error due to finite corrector-element size"', u: ads('1977JOSA...67..393H') };
  const RIGAUT = { c: 'Rigaut, F. J., Véran, J.-P. & Lai, O. 1998, Proc. SPIE 3353, 1038, "Analytical model for Shack-Hartmann-based adaptive optics systems"', u: ads('1998SPIE.3353.1038R') };
  const GENDRON = { c: 'Gendron, E. & Léna, P. 1994, A&A 291, 337, "Astronomical adaptive optics. I. Modal control optimization"', u: ads('1994A&A...291..337G') };
  const HARDY = { c: 'Hardy, J. W. 1998, Adaptive Optics for Astronomical Telescopes, Oxford University Press' };
  const RODDIER99 = { c: 'Roddier, F. (ed.) 1999, Adaptive Optics in Astronomy, Cambridge University Press' };
  const TYSON = { c: 'Tyson, R. K. 2010, Principles of Adaptive Optics, 3rd ed., CRC Press' };
  const BORNWOLF = { c: 'Born, M. & Wolf, E. 1999, Principles of Optics, 7th ed., Cambridge University Press (section 8.5, diffraction at a circular aperture)' };
  const AIRY = { c: 'Airy, G. B. 1835, Trans. Cambridge Philos. Soc. 5, 283, "On the diffraction of an object-glass with circular aperture"' };
  const MOFFAT = { c: 'Moffat, A. F. J. 1969, A&A 3, 455, "A theoretical investigation of focal stellar images in the photographic emulsion and application to photographic photometry"', u: ads('1969A&A.....3..455M') };
  const TRUJILLO = { c: 'Trujillo, I. et al. 2001, MNRAS 328, 977, "The effects of seeing on Sersic profiles. II. The Moffat PSF"', u: ads('2001MNRAS.328..977T') };
  const MARQUARDT = { c: 'Marquardt, D. W. 1963, J. Soc. Ind. Appl. Math. 11, 431, "An algorithm for least-squares estimation of nonlinear parameters"', u: 'https://doi.org/10.1137/0111030' };
  const LEVENBERG = { c: 'Levenberg, K. 1944, Q. Appl. Math. 2, 164, "A method for the solution of certain non-linear problems in least squares"' };
  const MAHAJAN = { c: 'Mahajan, V. N. 1983, J. Opt. Soc. Am. 73, 860, "Strehl ratio for primary aberrations in terms of their aberration variance"', u: ads('1983JOSA...73..860M') };
  const MARECHAL = { c: "Maréchal, A. 1947, Rev. Opt. 26, 257, \"Étude des effets combinés de la diffraction et des aberrations géométriques sur l'image d'un point lumineux\"" };
  const SARAZIN = { c: 'Sarazin, M. & Roddier, F. 1990, A&A 227, 294, "The ESO differential image motion monitor"', u: ads('1990A&A...227..294S') };
  const BESSELL = { c: 'Bessell, M. S. 1979, PASP 91, 589, "UBVRI photometry. II. The Cousins VRI system, its temperature and absolute flux calibration and relevance for two-dimensional photometry"', u: ads('1979PASP...91..589B') };
  const ROUSSET = { c: 'Rousset, G. 1999, "Wave-front sensors", in Adaptive Optics in Astronomy (ed. F. Roddier), Cambridge University Press' };

  const tips = {
    closed: 'Close the loop so that the mirror corrects the wavefront. Open it to see the turbulence alone.',
    play: 'Pause or resume the simulation.',
    restart: 'Generate new turbulence and reset the loop and the long exposure.',
    speed: 'How many loop frames are computed for each frame shown. The simulation runs slower than real time.',
    'expo-group': 'Short exposure: one frame, with frozen speckles. Long exposure: the average of many frames.',
    showfit: 'Draw the fitted function over the radial profile.',
    fit1: 'First function fitted to the radial profile of the long exposure.',
    fit2: 'Optional second function. The fit is the sum of the two.',
    'dm-row': 'Row of actuators shown in the side view of the mirror.',
    reset: 'Restore every parameter to its default value.',
    r0: 'Size of a patch of flat wavefront at 500 nm. Smaller means stronger turbulence.',
    L0: 'Largest size of the turbulent eddies. A smaller L₀ means less image motion.',
    wind: 'Speed at which the turbulence is carried across the telescope.',
    wdir: 'Direction of the wind on the pupil, from the horizontal axis.',
    D: 'Diameter of the telescope. It sets the diffraction limit λ/D.',
    lam: 'Wavelength of the camera. Longer wavelengths see less turbulence but have a wider diffraction limit.',
    nact: 'Number of actuators across the pupil. More actuators correct finer details.',
    fs: 'How many times per second the loop measures and corrects.',
    gain: 'Fraction of the measured error that is corrected at each step. Too high becomes unstable.',
    delay: 'Number of frames between a measurement and its correction.',
    mag: 'Brightness of the guide star. Fainter stars give noisier measurements.',
    'read-dr0': 'Number of r₀ patches across the telescope at the imaging wavelength.',
    'read-pitch': 'Distance between actuators, and its ratio to r₀.',
    'read-fitstrehl': 'Best Strehl ratio that this number of actuators could give with no other error.',
    'read-photons': 'Photons collected by one subaperture of the wavefront sensor in one frame.',
    'read-noise': 'Error of the wavefront measurement from photon noise, per actuator.',
    'row-fit': 'Width of the fitted function at half of its maximum.',
    'row-data': 'Width measured directly on the profile, with no model.',
    'row-diff': 'Width of a perfect image of the telescope: 1.03 λ/D.',
    'row-seeing': 'Width of the uncorrected image, 0.98 λ/r₀, reduced by the outer scale.',
    'row-eps0': 'The seeing as it is usually quoted, at a wavelength of 500 nm.',
    'row-quad': 'Rough estimate of the width when the two blurs add up independently.'
  };
  const bind = {
    r0: 'r0', L0: 'L0', wind: 'wind', wdir: 'wdir', D: 'D', lam: 'lam', nact: 'nact', fs: 'fs', gain: 'gain', delay: 'delay', mag: 'mag',
    fit1: 'fit', fit2: 'fit', 'dm-row': 'dmstroke'
  };
  const panels = { 't-wave': 'wavefront', 't-psf': 'psf', 't-ts': 'performance', 't-dm': 'dm' };

  const topics = {
    r0: {
      title: 'Fried parameter r₀',
      what: 'The diameter of a circular patch over which the turbulent wavefront stays roughly flat (about 1 rad of RMS phase error). It measures how strong the turbulence is: the smaller r₀ is, the worse the seeing.',
      theory: [
        R`Kolmogorov (1941) showed that in the inertial range the fluctuations of the refractive index of air have a power-law spectrum. Tatarskii (1961) and Fried (1966) turned this into the statistics of the phase of a wave that crosses the atmosphere. All that matters is one length, $r_0$.`,
        R`$r_0$ integrates the strength of the turbulence $C_n^2(h)$ along the line of sight, so it is smaller at low elevation. It grows with the wavelength as $\lambda^{6/5}$, which is why the infrared is easier to correct. The ratio $D/r_0$ counts how many independent patches fit across the telescope: it sets how blurred the image is and how many actuators are useful.`
      ],
      formulas: [
        { note: R`definition (Fried 1966), $k=2\pi/\lambda$, $z$ = zenith angle`, tex: R`r_0=\left[0.423\,k^{2}\sec z\int C_n^{2}(h)\,dh\right]^{-3/5}` },
        { note: 'phase structure function of Kolmogorov turbulence', tex: R`D_\varphi(r)=6.88\left(\frac{r}{r_0}\right)^{5/3}` },
        { note: 'scaling with wavelength', tex: R`r_0(\lambda)=r_0(500\,{\rm nm})\left(\frac{\lambda}{0.5\,\mu{\rm m}}\right)^{6/5}` },
        { note: 'phase variance over a circular pupil, piston removed (Noll 1976)', tex: R`\sigma_\varphi^{2}\simeq1.03\left(\frac{D}{r_0}\right)^{5/3}\ {\rm rad}^{2}` }
      ],
      sim: R`The phase screen is generated from the von Kármán spectrum (see {{L0|outer scale}}) with $r_0$ at 500 nm, then scaled to the imaging wavelength. The page shows $D/r_0$ at that wavelength.`,
      refs: [KOLM, TATARSKII, FRIED, RODDIER81, NOLL],
      see: ['L0', 'lam', 'dr0']
    },
    L0: {
      title: 'Outer scale L₀',
      what: 'The size of the largest turbulent eddies. Above it the turbulence spectrum flattens, so the large-scale wavefront tilt, and the image motion that goes with it, are weaker than pure Kolmogorov theory predicts.',
      theory: [
        R`von Kármán (1948) modified the Kolmogorov spectrum with a finite outer scale. Measurements at observatories give values from a few metres to a few tens of metres, with large variations from night to night.`,
        R`Most of the effect is on the lowest spatial frequencies, which carry the tilt of the wavefront. Tokovinin (2002) gives a simple correction for the width of a long-exposure image.`
      ],
      formulas: [
        { note: 'phase power spectrum with outer scale ($f$ in cycles per metre, result in rad² m²)', tex: R`\Phi_\varphi(f)=0.023\,r_0^{-5/3}\left(f^{2}+L_0^{-2}\right)^{-11/6}` },
        { note: R`seeing with outer scale (Tokovinin 2002), from the Kolmogorov value $\varepsilon_{\rm K}$`, tex: R`\varepsilon_{\rm vK}\simeq\varepsilon_{\rm K}\sqrt{1-2.183\left(\frac{r_0}{L_0}\right)^{0.356}}` }
      ],
      sim: R`The screen is a periodic FFT screen four pupil diameters wide. Three levels of subharmonics (Lane et al. 1992) add the large scales, so that tilt follows the spectrum above. This is the formula used for the "seeing limit" in the table.`,
      refs: [VONKARMAN, TOKOVININ, LANE],
      see: ['r0', 'fwhm-seeing']
    },
    wind: {
      title: 'Wind speed',
      what: 'How fast the turbulent layer is carried across the telescope. The wavefront seen by the mirror changes at this rate, so it sets how fast the loop has to be.',
      theory: [
        R`Taylor (1938) proposed the frozen-flow hypothesis: turbulence is carried by the wind without changing shape while it crosses the telescope. The phase then only needs to be known at one instant and moved.`,
        R`The coherence time $\tau_0$ is how long the wavefront stays about the same. The Greenwood frequency $f_G$ is the bandwidth a loop needs. When the correction is applied a time $\tau$ late, it is the turbulence of the past that is cancelled, and a residual of variance $D_\varphi(v\tau)$ remains.`
      ],
      formulas: [
        { note: 'frozen flow', tex: R`\varphi(\mathbf x,t)=\varphi(\mathbf x-\mathbf v\,t,\ 0)` },
        { note: 'coherence time and Greenwood frequency for one layer', tex: R`\tau_0\simeq0.314\,\frac{r_0}{v},\qquad f_G\simeq0.427\,\frac{v}{r_0}` },
        { note: R`error of a correction applied a time $\tau$ late`, tex: R`\sigma_\tau^{2}\simeq D_\varphi(v\tau)=6.88\left(\frac{v\tau}{r_0}\right)^{5/3}` },
        { note: 'the same, with the Greenwood frequency', tex: R`\sigma_\tau^{2}\simeq28.4\,(f_G\tau)^{5/3}` }
      ],
      sim: R`A single layer is shifted by $v\,\Delta t$ at every loop step, with bilinear interpolation between pupil samples.`,
      refs: [TAYLOR, RODDIER81, GREENWOOD],
      see: ['wdir', 'fs', 'delay']
    },
    wdir: {
      title: 'Wind direction',
      what: 'The direction in which the turbulence moves across the pupil, measured from the horizontal axis.',
      theory: [
        R`The correction is late, so the mirror is always a distance $v\tau$ behind the turbulence along the wind. The error is largest for structures that vary along that direction and small across it, so the residual is not isotropic.`,
        R`In the image this appears as a halo stretched along the direction of the wind. Turn up the wind speed or the delay and watch the long-exposure image elongate.`
      ],
      formulas: [
        { note: R`shift of the turbulence at each loop step, $\theta$ = wind direction`, tex: R`(\Delta x,\Delta y)=v\,\Delta t\,(\cos\theta,\ \sin\theta)` },
        { note: 'distance the turbulence travels during the delay', tex: R`\ell=v\,\tau=v\,d\,\Delta t` }
      ],
      refs: [TAYLOR, HARDY],
      see: ['wind', 'delay']
    },
    D: {
      title: 'Telescope diameter D',
      what: 'The diameter of the circular opening of the telescope. It sets the sharpest image the telescope can make, and how many r₀ fit across it.',
      theory: [
        R`Light that goes through a circular aperture forms the Airy pattern (Airy 1835): a bright core surrounded by faint rings. For a point source, its full width at half maximum is $1.03\,\lambda/D$, and the first dark ring is at $1.22\,\lambda/D$.`,
        R`Without correction, the image is blurred to about $\lambda/r_0$ whatever the diameter once $D\gg r_0$, so a larger telescope gains light but not sharpness. Adaptive optics removes this limit: the image can approach $\lambda/D$ again.`
      ],
      formulas: [
        { note: R`Airy pattern, $\theta$ = angle from the star, $J_1$ = Bessel function`, tex: R`I(\theta)=I_0\left[\frac{2J_1(x)}{x}\right]^{2},\qquad x=\frac{\pi D\theta}{\lambda}` },
        { note: 'width of the core', tex: R`{\rm FWHM}_{\rm diff}=1.029\,\frac{\lambda}{D}` },
        { note: 'position of the first dark ring', tex: R`\theta_1=1.22\,\frac{\lambda}{D}` },
        { note: 'conversion to arcseconds', tex: R`\theta\,[{\rm arcsec}]=206265\,\frac{\lambda}{D}` }
      ],
      sim: R`The pupil is sampled on 64 × 64 points, so one sample is $D/64$. Distances in the image are given in $\lambda/D$, two pixels per $\lambda/D$.`,
      refs: [AIRY, BORNWOLF, FRIED],
      see: ['r0', 'fwhm-diff', 'psf']
    },
    lam: {
      title: 'Imaging wavelength λ',
      what: 'The wavelength at which the camera observes the star.',
      theory: [
        R`The delay that turbulence adds to light is a length, the optical path difference. It is almost the same at all wavelengths. The phase is that length in units of the wavelength, so $\varphi=2\pi\,{\rm OPD}/\lambda$ shrinks as $1/\lambda$, and $r_0$ grows as $\lambda^{6/5}$.`,
        R`In the infrared the atmosphere is therefore easier to correct, but the diffraction limit $\lambda/D$ is wider. The balance is why most astronomical adaptive optics works in the near infrared.`
      ],
      formulas: [
        { note: 'phase at the imaging wavelength from the phase at 500 nm', tex: R`\varphi_\lambda=\varphi_{500}\,\frac{0.5\,\mu{\rm m}}{\lambda}` },
        { note: 'Fried parameter', tex: R`r_0\propto\lambda^{6/5}` },
        { note: 'diffraction limit', tex: R`\theta_{\rm diff}\propto\lambda/D` }
      ],
      refs: [RODDIER81, HARDY],
      see: ['r0', 'D']
    },
    nact: {
      title: 'Actuators across the pupil',
      what: 'The number N of actuators along the diameter of the deformable mirror. The mirror has N × N actuators in a square grid, about (π/4)N² of them inside the circular pupil.',
      theory: [
        R`Actuators spaced by $d=D/N$ can reproduce the spatial frequencies up to the Nyquist limit $1/(2d)$. In the image this means that the mirror controls the region within $N/2\;\lambda/D$ of the star, the square drawn on the image. Outside it, the light of the finest turbulence is not corrected and forms a halo.`,
        R`The wavefront variance that is left is the fitting error (Hudgin 1977). Its coefficient $\kappa$ depends on the shape of the influence function of the actuators: about 0.28 for typical mirrors, and 0.22 in this simulation, whose mirror is an ideal spatial low-pass filter.`
      ],
      formulas: [
        { note: 'pitch and cut-off frequency', tex: R`d=\frac{D}{N},\qquad f_c=\frac{1}{2d}` },
        { note: 'radius of the corrected region in the image', tex: R`\theta_c=\frac{N}{2}\,\frac{\lambda}{D}` },
        { note: 'fitting error', tex: R`\sigma_{\rm fit}^{2}=\kappa\left(\frac{d}{r_0}\right)^{5/3}\ {\rm rad}^{2}` },
        { note: 'Strehl ratio from a small phase error (Maréchal approximation)', tex: R`S\simeq e^{-\sigma^{2}}` }
      ],
      sim: R`The mirror keeps the Fourier modes with $|k_x|,|k_y|\le N/2$ cycles per diameter. Averaged over many realisations of the turbulence, the simulation gives $\kappa\simeq0.22$ and the expected $(d/r_0)^{5/3}$ scaling.`,
      refs: [HUDGIN, RIGAUT, HARDY],
      see: ['pitch', 'fitstrehl', 'psf']
    },
    fs: {
      title: 'Loop frequency',
      what: 'How many times per second the system measures the wavefront and updates the mirror.',
      theory: [
        R`Between a measurement and the correction the atmosphere moves on. A faster loop makes this lag shorter and the temporal error smaller. For a loop with error-rejection bandwidth $f_{\rm 3dB}$ and Kolmogorov turbulence blown at Greenwood frequency $f_G$, Greenwood (1977) found the temporal error below.`,
        R`For a simple integrator of gain $g$, the loop crosses unity gain at about $g f_s/2\pi$, which is a good estimate of its bandwidth. A faster loop collects fewer photons per frame, so it needs a brighter guide star.`
      ],
      formulas: [
        { note: 'loop period', tex: R`\Delta t=\frac{1}{f_s}` },
        { note: 'bandwidth of an integrator with small gain', tex: R`f_{\rm 3dB}\sim\frac{g\,f_s}{2\pi}` },
        { note: 'temporal error (Greenwood 1977)', tex: R`\sigma_t^{2}=\left(\frac{f_G}{f_{\rm 3dB}}\right)^{5/3}` }
      ],
      refs: [GREENWOOD, GENDRON, HARDY],
      see: ['wind', 'gain', 'delay', 'mag']
    },
    gain: {
      title: 'Loop gain',
      what: 'The fraction of the measured error that is added to the mirror command at every step. The controller is an integrator.',
      theory: [
        R`With a low gain the loop is slow but smooth and rejects noise. With a high gain it follows the turbulence faster but passes more noise, and it can become unstable when the delay is long, because the correction then arrives when the error has already changed sign.`,
        R`For an integrator that applies each command $d$ frames after the measurement, the loop becomes unstable above a critical gain (Gendron & Léna 1994, see also Hardy 1998). The simulation shows a warning in that case.`
      ],
      formulas: [
        { note: 'integrator', tex: R`c_k=c_{k-1}+g\,m_k` },
        { note: 'open-loop transfer function of an integrator with a delay of $d$ frames', tex: R`L(z)=\frac{g\,z^{-d}}{1-z^{-1}}` },
        { note: 'stability condition (gain margin)', tex: R`g<2\sin\!\left(\frac{\pi}{2\,(2d-1)}\right)` },
        { note: 'noise gain of an integrator, for white noise and no delay', tex: R`\sigma^{2}_{\rm out}\simeq\frac{g}{2-g}\,\sigma^{2}_{\rm in}` }
      ],
      sim: R`The limit on $g$ is 2 for $d=1$, 1 for $d=2$, 0.62 for $d=3$ and 0.45 for $d=4$. The command has a very small leak (0.9995 per step) and is limited to ±60 rad to keep an unstable loop finite.`,
      refs: [GENDRON, HARDY, RODDIER99],
      see: ['delay', 'fs', 'mag']
    },
    delay: {
      title: 'Loop delay',
      what: 'The number of loop frames between the measurement of the wavefront and the moment the mirror applies the matching correction. It includes the exposure of the sensor, its read-out and the computation.',
      theory: [
        R`With a delay of $\tau=d\,\Delta t$, the mirror cancels the turbulence of a time $\tau$ ago. The error is the change of the turbulence during that time, which grows as $\tau^{5/3}$, and the delay also reduces the highest gain that keeps the loop stable.`,
        R`Typical astronomical systems have a total delay of about two frames: one for the exposure, and about one for the read-out and the computation.`
      ],
      formulas: [
        { note: 'delay in seconds', tex: R`\tau=d\,\Delta t=\frac{d}{f_s}` },
        { note: 'error of a pure delay', tex: R`\sigma_\tau^{2}\simeq6.88\left(\frac{v\,\tau}{r_0}\right)^{5/3}` },
        { note: 'highest stable gain of an integrator', tex: R`g_{\max}=2\sin\!\left(\frac{\pi}{2\,(2d-1)}\right)` }
      ],
      refs: [GENDRON, GREENWOOD, HARDY],
      see: ['gain', 'fs', 'wind']
    },
    mag: {
      title: 'Guide-star magnitude',
      what: 'The brightness of the star that the wavefront sensor measures. A larger magnitude means a fainter star, fewer photons and a noisier measurement.',
      theory: [
        R`Each subaperture of the sensor collects the photons that fall on an area $d^2$ in one loop period. The phase noise of a photon-limited measurement is about one radian divided by the square root of their number, scaled by the sensor wavelength (Rousset 1999).`,
        R`This noise goes into the mirror commands through the loop. A lower gain filters it, at the price of a slower correction, so faint guide stars need a lower gain.`
      ],
      formulas: [
        { note: R`photons per subaperture per frame ($F_0\simeq1.1\times10^{10}$ photons s⁻¹ m⁻² at magnitude 0, throughput $\eta=0.3$)`, tex: R`N_{\rm ph}=F_0\,10^{-0.4\,m}\,\eta\,d^{2}\,\Delta t` },
        { note: R`measurement noise as an optical path difference, with the sensor at $\lambda_{\rm wfs}=0.7\,\mu$m`, tex: R`\sigma_{\rm OPD}\simeq\frac{\lambda_{\rm wfs}}{2\pi}\,\frac{1}{\sqrt{N_{\rm ph}}}` },
        { note: 'noise as a phase at the imaging wavelength', tex: R`\sigma_\varphi=\frac{2\pi\,\sigma_{\rm OPD}}{\lambda}` }
      ],
      sim: R`This is a simplified estimate, with a flat photon flux and no read-out noise or sky background. A noise value is drawn for each actuator cell at every step and added to the measurement.`,
      refs: [ROUSSET, BESSELL, HARDY],
      see: ['photons', 'noise', 'gain']
    },
    fit: {
      title: 'Fitting the radial profile',
      what: 'The average brightness of the long-exposure image in rings around the star is fitted by a Gaussian, a Moffat or an Airy function, or by the sum of any two of them. The fit gives a width, the FWHM, that can be compared with theory.',
      theory: [
        R`The Airy function is the diffraction pattern of a circular aperture (Airy 1835), so it fits the core of a corrected image. The Moffat function (Moffat 1969) has power-law wings, as the halo of an image blurred by turbulence has. Trujillo et al. (2001) found $\beta\simeq4.765$ for pure Kolmogorov turbulence. A Gaussian is a smooth core without wings.`,
        R`A sum of two functions can describe a sharp core inside a broad halo, as in a partly corrected image, for example Airy + Moffat. The fit minimises the sum of squared relative differences with the Levenberg–Marquardt algorithm (Levenberg 1944, Marquardt 1963).`
      ],
      formulas: [
        { note: R`Gaussian, $\mathrm{FWHM}=2\sqrt{2\ln2}\,\sigma$`, tex: R`f(r)=A\,e^{-r^{2}/2\sigma^{2}}` },
        { note: R`Moffat, $\mathrm{FWHM}=2\alpha\sqrt{2^{1/\beta}-1}$`, tex: R`f(r)=A\left[1+\left(\frac{r}{\alpha}\right)^{2}\right]^{-\beta}` },
        { note: R`Airy, $x=\pi r/w$, $\mathrm{FWHM}=1.029\,w$; $w=\lambda/D$ for a perfect telescope`, tex: R`f(r)=A\left[\frac{2J_1(x)}{x}\right]^{2}` },
        { note: 'quantity that is minimised: $m$ = model, $d_i$ = data', tex: R`\chi^{2}=\sum_i\left[\frac{m(r_i)-d_i}{0.1\,d_i+0.002}\right]^{2}` }
      ],
      sim: R`The profile is the azimuthal average of the long exposure, in rings of a quarter of a pixel, up to $16\,\lambda/D$. The parameters are fitted as logarithms so that they stay positive. For two functions, both ways of assigning the core and the halo are tried. The FWHM of a sum is found numerically, where the fit falls to half of its central value.`,
      refs: [AIRY, MOFFAT, TRUJILLO, LEVENBERG, MARQUARDT],
      see: ['fwhm-fit', 'fwhm-data', 'psf']
    },
    dmstroke: {
      title: 'Mirror stroke and the row shown',
      what: 'The stroke of an actuator is how far it pushes or pulls the surface of the mirror. The slider chooses which row of actuators is drawn in the side view, from −0.5 to +0.5 of the diameter.',
      theory: [
        R`Light that reflects on a mirror that is displaced by $z$ travels a path longer by $2z$. A phase correction $\varphi$ at wavelength $\lambda$ therefore needs a surface displacement of $\lambda\varphi/4\pi$. A correction of one radian at $1\,\mu$m asks for only 80 nm of stroke.`,
        R`The stroke needed grows with the strength of the turbulence and with the diameter. Most of it is tilt, which is why many systems have a separate tip-tilt mirror. Practical deformable mirrors have strokes of a few micrometres.`
      ],
      formulas: [
        { note: R`surface displacement for a phase $\varphi$ at wavelength $\lambda$ (reflection doubles the path)`, tex: R`z=\frac{\lambda}{4\pi}\,\varphi` },
        { note: 'actuators that are drawn: those within one half pitch of the pupil edge', tex: R`\sqrt{x^{2}+y^{2}}\le\frac{D}{2}+\frac{d}{2}` }
      ],
      refs: [TYSON, HARDY],
      see: ['dm', 'nact']
    },
    dr0: {
      title: 'D / r₀ at the imaging wavelength',
      what: 'The number of r₀ patches across the telescope, computed at the wavelength of the camera.',
      theory: [
        R`It is the main measure of how hard the correction is. For $D/r_0\lesssim1$ the telescope is nearly diffraction-limited without any correction. For large values the image is a cloud of about $(D/r_0)^2$ speckles.`
      ],
      formulas: [
        { tex: R`\frac{D}{r_0(\lambda)}=\frac{D}{r_0(500\,{\rm nm})\,(\lambda/0.5\,\mu{\rm m})^{6/5}}` },
        { note: 'number of speckles in a short exposure', tex: R`N_{\rm speckle}\sim\left(\frac{D}{r_0}\right)^{2}` },
        { note: 'width of the long exposure of a large telescope', tex: R`{\rm FWHM}\simeq0.98\,\frac{\lambda}{r_0}` }
      ],
      refs: [FRIED, RODDIER81],
      see: ['r0', 'lam']
    },
    pitch: {
      title: 'Actuator pitch d',
      what: 'The distance between neighbouring actuators in the pupil, and its ratio to r₀ at the imaging wavelength.',
      theory: [
        R`The fitting error depends on $d/r_0$: the closer the actuators are compared with the size of the flat patches of the wavefront, the better the correction. A ratio of about 1 gives a Strehl ratio of about 0.8 from fitting alone, and about 0.5 gives about 0.93.`
      ],
      formulas: [
        { tex: R`d=\frac{D}{N_{\rm act}}` },
        { note: 'fitting error', tex: R`\sigma_{\rm fit}^{2}=\kappa\left(\frac{d}{r_0}\right)^{5/3}` }
      ],
      refs: [HUDGIN, HARDY],
      see: ['nact', 'fitstrehl']
    },
    fitstrehl: {
      title: 'Strehl limit from fitting error alone',
      what: 'The best Strehl ratio that this mirror could reach if the only error were the fitting error, with an infinitely fast loop and no noise.',
      theory: [
        R`The Strehl ratio is the peak of the image divided by the peak of a perfect telescope. For small errors, Maréchal (1947) showed that it is related to the variance of the phase error across the pupil, and Mahajan (1983) showed that the approximation works well for variances up to about 1 rad².`
      ],
      formulas: [
        { tex: R`S_{\rm fit}\simeq\exp\!\left[-0.22\left(\frac{d}{r_0}\right)^{5/3}\right]` },
        { note: 'general approximation', tex: R`S\simeq e^{-\sigma^{2}}` }
      ],
      sim: R`0.22 is the value found for the ideal mirror of this simulation. For a real mirror, use 0.28.`,
      refs: [MARECHAL, MAHAJAN, HUDGIN],
      see: ['nact', 'performance']
    },
    photons: {
      title: 'Photons per subaperture per frame',
      what: 'The number of photons that one subaperture of the wavefront sensor collects during one loop period.',
      theory: [
        R`It depends on the brightness of the guide star, on the area of the subaperture $d^2$, on the exposure time $1/f_s$ and on the throughput of the system. A faster loop or smaller subapertures collect fewer photons each.`
      ],
      formulas: [
        { tex: R`N_{\rm ph}=F_0\,10^{-0.4\,m}\,\eta\,d^{2}\,\Delta t` }
      ],
      refs: [BESSELL, ROUSSET],
      see: ['mag', 'noise']
    },
    noise: {
      title: 'Sensor noise per actuator',
      what: 'The error that photon noise puts on the measurement of the wavefront at each actuator, as an optical path difference in nanometres.',
      theory: [
        R`It scales as $1/\sqrt{N_{\rm ph}}$. A noise of 20 nm at the sensor corresponds to a phase error of about 0.16 rad at 0.8 µm. The loop averages part of it, depending on the gain.`
      ],
      formulas: [
        { tex: R`\sigma_{\rm OPD}\simeq\frac{111\ {\rm nm}}{\sqrt{N_{\rm ph}}}` },
        { note: 'noise that goes into the mirror (integrator, white noise)', tex: R`\sigma^{2}_{\rm mirror}\simeq\frac{g}{2-g}\,\sigma_\varphi^{2}` }
      ],
      refs: [ROUSSET, HARDY],
      see: ['mag', 'gain']
    },
    'fwhm-fit': {
      title: 'FWHM of the fit',
      what: 'The full width at half maximum of the function that was fitted: the width of the core, taken where the fit falls to half of its central value.',
      theory: [
        R`For one function, the width follows from the formulas given in the explanation of the fit. For a sum of two functions it is found numerically.`,
        R`The result depends on the function that is chosen. A function that does not describe the shape well, for example a single Gaussian fitted to an Airy core, gives a biased width. The misfit shown under the table tells how well the fit describes the data.`
      ],
      formulas: [
        { note: 'solve for the half-maximum radius', tex: R`f(r_{1/2})=\tfrac12\,f(0)` },
        { tex: R`{\rm FWHM}=2\,r_{1/2}` },
        { note: R`one pixel of the image is $\lambda/2D$, so`, tex: R`{\rm FWHM}\ [\lambda/D]=r_{1/2}\ [{\rm pixels}]` }
      ],
      refs: [AIRY, MOFFAT, MARQUARDT],
      see: ['fit', 'fwhm-data']
    },
    'fwhm-data': {
      title: 'FWHM measured on the data',
      what: 'The width found directly on the averaged profile, without any fit: where the profile first falls to half of the value at its centre, by linear interpolation.',
      theory: [
        R`It is a check on the fit. Because the image has two pixels per $\lambda/D$, a diffraction-limited core is only sampled by about two points, so this value is good to a few per cent. With the loop open, it changes by about 20 % between runs, because a few seconds of exposure hold few independent samples of the large-scale tilt.`
      ],
      formulas: [
        { tex: R`I(r_{1/2})=\tfrac12\,I(0)` }
      ],
      refs: [FRIED],
      see: ['fwhm-fit', 'fwhm-diff']
    },
    'fwhm-diff': {
      title: 'Diffraction limit',
      what: 'The width of the image of a point source made by a perfect telescope of diameter D, without any turbulence.',
      theory: [
        R`It is the full width at half maximum of the Airy pattern of a circular aperture without central obstruction (Airy 1835, Born & Wolf). It is the sharpest image that the telescope can give.`
      ],
      formulas: [
        { tex: R`{\rm FWHM}_{\rm diff}=1.029\,\frac{\lambda}{D}` }
      ],
      refs: [AIRY, BORNWOLF],
      see: ['D', 'psf']
    },
    'fwhm-seeing': {
      title: 'Seeing limit at the imaging wavelength',
      what: 'The width of the long-exposure image without correction, at the imaging wavelength, including the effect of the outer scale.',
      theory: [
        R`For Kolmogorov turbulence and a large telescope, the long-exposure image has a width of $0.98\,\lambda/r_0$, independent of D (Fried 1966, Roddier 1981). A finite outer scale makes it smaller (Tokovinin 2002). Because $r_0\propto\lambda^{6/5}$, the seeing varies as $\lambda^{-1/5}$.`
      ],
      formulas: [
        { tex: R`\varepsilon_{\rm K}=0.98\,\frac{\lambda}{r_0(\lambda)}` },
        { note: 'with the outer scale (Tokovinin 2002)', tex: R`\varepsilon_{\rm vK}=\varepsilon_{\rm K}\sqrt{1-2.183\left(\frac{r_0}{L_0}\right)^{0.356}}` }
      ],
      refs: [FRIED, RODDIER81, TOKOVININ],
      see: ['r0', 'L0', 'fwhm-eps0']
    },
    'fwhm-eps0': {
      title: 'Seeing ε₀ at 500 nm',
      what: 'The seeing as it is usually quoted by observatories: the width of the long-exposure image of a star at a wavelength of 500 nm, in arcseconds.',
      theory: [
        R`Site seeing is measured with a differential image motion monitor, which records the relative motion of two images of a star (Sarazin & Roddier 1990), and quoted at 500 nm so that sites can be compared. Good sites have a median value of about 0.6 to 0.8 arcseconds.`
      ],
      formulas: [
        { note: 'in radians', tex: R`\varepsilon_0=0.98\,\frac{0.5\,\mu{\rm m}}{r_0(500\,{\rm nm})}` },
        { tex: R`1\ {\rm rad}=206265\ {\rm arcsec}` }
      ],
      refs: [RODDIER81, SARAZIN],
      see: ['r0', 'fwhm-seeing']
    },
    'fwhm-quad': {
      title: 'Diffraction and seeing in quadrature',
      what: 'A rough estimate of the width of the uncorrected image of a telescope: the diffraction limit and the seeing limit added in quadrature.',
      theory: [
        R`Two independent blurs of roughly Gaussian shape add their variances, so their widths add in quadrature. This is only exact for Gaussians, but a good rule of thumb for telescopes that are neither much larger nor much smaller than $r_0$.`
      ],
      formulas: [
        { tex: R`{\rm FWHM}\simeq\sqrt{{\rm FWHM}_{\rm diff}^{2}+\varepsilon_{\rm vK}^{2}}` }
      ],
      see: ['fwhm-diff', 'fwhm-seeing']
    },
    wavefront: {
      title: 'Wavefront and phase maps',
      what: 'Starlight arrives as a flat wave. The atmosphere delays it by different amounts at different places of the telescope pupil. The three maps show this delay, the correction of the mirror, and what remains.',
      theory: [
        R`The delay is shown as a phase in radians: $2\pi$ rad is one wavelength. A flat wavefront gives a perfect image. The piston, the mean phase, is removed because it does not change the image. About 87 % of the variance of Kolmogorov turbulence over a pupil is tilt (Noll 1976).`,
        R`The residual is what the camera sees: the atmosphere minus the mirror. The three maps share the same colour scale, which is set from the turbulence.`
      ],
      formulas: [
        { tex: R`\varphi(x,y)=\frac{2\pi}{\lambda}\,{\rm OPD}(x,y)` },
        { note: 'what remains after the correction', tex: R`\varphi_{\rm res}=\varphi_{\rm atm}-\varphi_{\rm DM}` },
        { note: 'RMS phase over the pupil', tex: R`\sigma=\sqrt{\langle\varphi^{2}\rangle-\langle\varphi\rangle^{2}}` },
        { note: 'variance without the tilt (Noll 1976)', tex: R`\sigma^{2}_{\rm no\ tilt}\simeq0.134\left(\frac{D}{r_0}\right)^{5/3}` }
      ],
      refs: [NOLL, HARDY],
      see: ['r0', 'psf', 'dm']
    },
    psf: {
      title: 'Image of the star, PSF and Strehl ratio',
      what: 'The point-spread function (PSF) is the image that the telescope makes of a point-like star. It is shown on a logarithmic scale and normalised to the peak of a perfect telescope.',
      theory: [
        R`The PSF is the squared modulus of the Fourier transform of the pupil field, which is the pupil multiplied by the phase error. A perfect pupil gives the Airy pattern. Turbulence breaks the light into speckles, of width $\lambda/D$ each, spread over a halo of width $\lambda/r_0$. A short exposure freezes the speckles. A long exposure averages them into a smooth profile.`,
        R`The Strehl ratio is the peak of the image divided by the peak of a perfect telescope. A value above 0.8 is conventionally called diffraction-limited, from the Maréchal criterion.`
      ],
      formulas: [
        { tex: R`{\rm PSF}(\boldsymbol\theta)=\left|\mathcal F\left\{P(\mathbf x)\,e^{i\varphi_{\rm res}(\mathbf x)}\right\}\right|^{2}` },
        { note: 'Strehl ratio', tex: R`S=\frac{\max\ {\rm PSF}}{\max\ {\rm PSF}_{\rm diff}}\ \simeq\ e^{-\sigma^{2}}` },
        { note: 'long exposure: average of $n$ frames', tex: R`\langle{\rm PSF}\rangle=\frac{1}{n}\sum_{k=1}^{n}{\rm PSF}_k` }
      ],
      sim: R`The pupil is padded to a grid of 128 × 128, which gives two pixels per $\lambda/D$. The dashed square marks the region of radius $N_{\rm act}/2\;\lambda/D$ that the mirror controls.`,
      refs: [BORNWOLF, FRIED, MARECHAL, MAHAJAN],
      see: ['wavefront', 'performance', 'fit']
    },
    performance: {
      title: 'Loop performance: RMS phase and Strehl ratio',
      what: 'The residual phase error and the Strehl ratio, once per displayed frame, with the turbulence for comparison.',
      theory: [
        R`The errors of an adaptive optics system are independent, so their variances add. The main terms are the fitting error, the temporal error and the noise error (Rigaut et al. 1998, Hardy 1998).`,
        R`The short-exposure Strehl ratio, taken from the peak of one frame, fluctuates from frame to frame. The long-exposure value is its average over many frames, and is what a real camera would give.`
      ],
      formulas: [
        { note: 'error budget', tex: R`\sigma^{2}_{\rm tot}\simeq\sigma^{2}_{\rm fit}+\sigma^{2}_{t}+\sigma^{2}_{\rm noise}` },
        { tex: R`S\simeq\exp\left(-\sigma^{2}_{\rm tot}\right)` }
      ],
      refs: [RIGAUT, HARDY, MAHAJAN],
      see: ['nact', 'fs', 'mag']
    },
    dm: {
      title: 'The deformable mirror',
      what: 'A thin mirror whose surface is pushed and pulled by a grid of actuators. It takes the shape that cancels the distortion of the wavefront.',
      theory: [
        R`The faceplate follows the shape of the turbulence, but more smoothly, because the actuators can only reproduce scales larger than twice their spacing. It also follows it with a delay, because of the time between the measurement and the correction.`,
        R`In the side view, the pins show the stroke of each actuator of one row. The dashed line is the shape that the turbulence asks the mirror to take, and the solid line is the shape that the mirror has.`
      ],
      formulas: [
        { note: R`surface displacement for a phase $\varphi$`, tex: R`z=\frac{\lambda}{4\pi}\,\varphi` }
      ],
      refs: [TYSON, HARDY],
      see: ['dmstroke', 'nact', 'delay']
    }
  };

  return { tips, bind, panels, topics };
})();
