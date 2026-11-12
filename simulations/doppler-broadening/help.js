/* Explanations for the Doppler & rotational broadening simulation: tooltips, and theory, formulas and references.
   Rendered by ../shared/explain.js. Strings with backslashes use String.raw so that the TeX is written as is. */
window.SIM_HELP = (() => {
  const R = String.raw;
  const ads = (code) => 'https://ui.adsabs.harvard.edu/abs/' + code.replace(/&/g, '%26');

  const GRAY = { c: 'Gray, D. F. 2005, The Observation and Analysis of Stellar Photospheres, 3rd ed., Cambridge University Press, ch. 18' };
  const EINSTEIN = { c: 'Einstein, A. 1905, Annalen der Physik 322, 891, "Zur Elektrodynamik bewegter Körper"', u: ads('1905AnP...322..891E') };
  const SHAJN = { c: 'Shajn, G. & Struve, O. 1929, MNRAS 89, 222, "On the rotation of the stars"', u: ads('1929MNRAS..89..222S') };
  const CARROLL = { c: 'Carroll, B. W. & Ostlie, D. A. 2017, An Introduction to Modern Astrophysics, 2nd ed., Cambridge University Press' };

  const tips = {
    play: 'Pause or resume the rotation of the disk and the motion of the waves.',
    reset: 'Restore every parameter to its default value.',
    line: 'Pick a common spectral line, or choose a custom wavelength.',
    lambda0: 'Wavelength of the line in the frame of the source (nanometres). Editable for a custom line.',
    depth: 'How much light the line absorbs at its centre, as a fraction of the continuum.',
    sigma: 'Width of the line from a small patch of the star (thermal, turbulent and instrument broadening), before rotation.',
    dir: 'Approaching gives a blueshift, receding a redshift, stationary no shift.',
    speed: 'Speed along the line of sight. The sign comes from the direction.',
    scale: 'Stars move at up to a few hundred km/s. Fast sources such as quasar jets or galaxies need the relativistic formula.',
    model: 'Non-relativistic: λobs = λ₀(1 + v/c). Relativistic: λobs = λ₀ √((1+β)/(1−β)).',
    magnify: 'At real stellar speeds the wave spacing changes by less than 0.1 %. Magnify it so you can see which way it goes. The spectra are never magnified.',
    mode: 'Choose whether you set the equatorial speed directly, or the radius and the rotation period.',
    veq: 'Speed of the equator. Together with the inclination it gives v sin i.',
    radius: 'Radius of the star in solar radii (R☉ = 695 700 km). Jupiter is 0.10 R☉.',
    period: 'Time for one full rotation, in days. Used when the spin is set by radius and period.',
    inc: 'Angle between the spin axis and the line of sight. 0° is pole-on and 90° is edge-on.',
    ld: 'Linear limb-darkening coefficient: how much dimmer the edge of the disk is than its centre.',
    'r-lam0': 'Wavelength of the line in the source frame.',
    'r-lamobs': 'Wavelength seen by the observer.',
    'r-vr': 'Radial velocity, positive when the source recedes.',
    'r-dl': 'Observed minus rest wavelength.',
    'r-z': 'Fractional wavelength change, (λobs − λ₀)/λ₀.',
    'r-beta': 'Radial velocity as a fraction of the speed of light.',
    'r-model': 'How far the relativistic redshift differs from the non-relativistic one, in km/s of radial velocity.',
    'b-vsini': 'Equatorial speed projected on the line of sight. It sets the width of the line.',
    'b-veq': 'True speed of the equator.',
    'b-period': 'Rotation period, from P = 2πR/v_eq.',
    'b-dlmax': 'Distance in wavelength from the line centre to the edge of the broadened line.',
    'b-fwhm0': 'Full width at half depth of the line without rotation.',
    'b-fwhm': 'Full width at half depth of the rotationally broadened line.',
    'c-center': 'Where the line sits: the Doppler-shifted wavelength.',
    'c-centroid': 'Absorption-weighted mean wavelength of the broadened line. It stays at λobs because the kernel is symmetric.',
    'c-dlmax': 'Half-width of the rotation kernel at the observed wavelength: λobs v sin i / c.',
    'c-fwhm0': 'Width of the Doppler-shifted line without rotation.',
    'c-fwhm': 'Width of the Doppler-shifted and broadened line.'
  };

  const bind = {
    line: 'doppler', lambda0: 'doppler', dir: 'doppler', speed: 'doppler', scale: 'relativistic', model: 'relativistic',
    depth: 'intrinsic', sigma: 'intrinsic', mode: 'vsini', veq: 'vsini', radius: 'vsini', period: 'vsini', inc: 'inclination', ld: 'limb'
  };

  const panels = { 't-waves': 'doppler', 't-spec-a': 'doppler', 't-disk': 'vsini', 't-spec-b': 'kernel', 't-spec-c': 'combined' };

  const topics = {
    doppler: {
      title: 'The Doppler effect in spectroscopy',
      what: 'When a source moves along our line of sight, every wavelength it emits arrives shifted: shorter if it approaches, longer if it recedes.',
      theory: [
        R`Successive wave crests are emitted from positions that are closer to the observer (approaching) or farther away (receding), so they arrive closer together or farther apart. The speed of light does not change, only the wavelength and the frequency.`,
        R`In spectroscopy we compare the observed wavelength of a known line, for example H$\alpha$ at 656.281 nm, with its rest wavelength $\lambda_0$ measured in the laboratory. The sign convention here is that $v_r>0$ means the source recedes, which gives $z>0$ (redshift).`
      ],
      formulas: [
        { note: 'non-relativistic, $|v_r|\\ll c$', tex: R`\frac{\Delta\lambda}{\lambda_0}\simeq\frac{v_r}{c},\qquad \lambda_{\rm obs}=\lambda_0\left(1+\frac{v_r}{c}\right)` },
        { note: 'redshift', tex: R`z=\frac{\lambda_{\rm obs}-\lambda_0}{\lambda_0}` },
        { note: 'speed of light used here', tex: R`c = 299\,792.458\ {\rm km/s}` }
      ],
      sim: R`Panel A draws the same line twice: dashed at $\lambda_0$ and solid at $\lambda_{\rm obs}$. The color of the arrow is blue for approaching and red for receding.`,
      refs: [GRAY, CARROLL],
      see: ['relativistic', 'combined']
    },
    relativistic: {
      title: 'Relativistic Doppler formula',
      what: 'For fast sources the simple formula fails, because it misses the time dilation of the moving source.',
      theory: [
        R`For purely radial motion, the exact result of special relativity is $\lambda_{\rm obs}=\lambda_0\sqrt{(1+\beta)/(1-\beta)}$ with $\beta=v_r/c$. It is defined only for $|\beta|<1$ and it is always positive: no speed can push the wavelength through zero.`,
        R`Expanding it, $z=\beta+\beta^2/2+\dots$, so the two formulas differ by $\beta^2/2$. For a star at 30 km/s this is $5\times10^{-9}$, much smaller than the precision of any spectrograph; at $\beta=0.5$ it is not: $z=0.73$, not $0.5$.`
      ],
      formulas: [
        { note: 'relativistic, radial motion', tex: R`\lambda_{\rm obs}=\lambda_0\sqrt{\frac{1+\beta}{1-\beta}},\qquad \beta=\frac{v_r}{c}` },
        { note: 'redshift', tex: R`1+z=\sqrt{\frac{1+\beta}{1-\beta}}` },
        { note: 'difference between the two formulas', tex: R`z_{\rm rel}-z_{\rm nr}\simeq\frac{\beta^2}{2}` }
      ],
      sim: R`The row "Relativistic correction" gives the difference as an equivalent velocity. The range selector switches the slider up to $0.9\,c$ to make it large.`,
      refs: [EINSTEIN, CARROLL],
      see: ['doppler']
    },
    vsini: {
      title: 'Rotation and the projected speed v sin i',
      what: 'The spectrum only measures the part of the rotation speed that points along the line of sight.',
      theory: [
        R`For a rigid sphere, a point at horizontal position $x$ on the disk (in units of the radius, measured perpendicular to the projected spin axis) has line-of-sight velocity $v_{\rm los}=v_{\rm eq}\sin i\;x$, whatever its latitude. The left limb ($x=-1$) approaches and the right limb ($x=+1$) recedes.`,
        R`The inclination $i$ is the angle between the spin axis and the line of sight. At $i=0^\circ$ (pole-on) nothing moves along the line of sight and there is no rotational broadening. At $i=90^\circ$ (edge-on) the broadening is largest. A spectrum gives the product $v\sin i$, not $v_{\rm eq}$ alone.`,
        R`The velocity of one surface element is a Doppler shift. The broadening of the line is something else: it is the sum of the shifts of all the elements, weighted by their brightness.`
      ],
      formulas: [
        { note: 'equatorial speed of a rigid sphere of radius $R$ and period $P$', tex: R`v_{\rm eq}=\frac{2\pi R}{P}` },
        { note: 'projected speed', tex: R`v\sin i=v_{\rm eq}\sin i` },
        { note: 'line-of-sight speed at position $x$ on the disk', tex: R`v_{\rm los}=v\sin i\;x` }
      ],
      sim: R`The disk is colored with $v_{\rm los}$ on a fixed scale of $\pm100$ km/s, so a slow or pole-on star looks pale. With "radius and period" the equatorial speed is computed from $2\pi R/P$ with $R$ in solar radii.`,
      refs: [GRAY, SHAJN],
      see: ['inclination', 'kernel']
    },
    inclination: {
      title: 'Inclination i',
      what: 'The angle between the spin axis and the line of sight: 0° is pole-on, 90° is edge-on.',
      theory: [
        R`Because $\sin i$ multiplies the equatorial speed, the same star seen at different angles gives different line widths. Two stars with the same $v\sin i$ can have very different $v_{\rm eq}$, so $v\sin i$ is a lower limit to the true speed.`
      ],
      formulas: [{ note: 'projected speed', tex: R`v\sin i=v_{\rm eq}\sin i\ \le\ v_{\rm eq}` }],
      sim: R`Slide $i$ to 0°: $v\sin i$ drops to zero and the broadened line becomes the narrow line.`,
      refs: [GRAY],
      see: ['vsini']
    },
    limb: {
      title: 'Limb darkening ε',
      what: 'The edge of a star is dimmer than its centre, because we look at higher and cooler layers there.',
      theory: [
        R`A linear law describes it: $I(\mu)/I(1)=1-\epsilon(1-\mu)$ with $\mu=\cos\theta$, the cosine of the angle between the line of sight and the surface normal. $\epsilon=0$ is a uniformly bright disk; the Sun in visible light has about 0.6.`,
        R`The limbs are where the Doppler shifts are largest, so dimming them takes weight away from the wings of the broadened line.`
      ],
      formulas: [{ note: 'linear limb darkening', tex: R`\frac{I(\mu)}{I(1)}=1-\epsilon\,(1-\mu)` }],
      sim: R`The kernel plot compares your $\epsilon$ with $\epsilon=0$, which is an ellipse.`,
      refs: [GRAY],
      see: ['kernel']
    },
    kernel: {
      title: 'The rotational broadening kernel',
      what: 'The shape of a rotationally broadened line is not a Gaussian. It is the flux of each strip of the disk, placed at the wavelength of that strip.',
      theory: [
        R`A strip at position $x$ has length $2\sqrt{1-x^2}$ and all its points share the shift $x\,\Delta\lambda_{\max}$. Adding the limb-darkened brightness along the strip gives the kernel $G(x)$ below, normalised to unit area. The line is the intrinsic line convolved with $G$.`,
        R`Convolution moves the absorption around but does not create or remove any: the equivalent width of the line is the same with and without rotation, so the broadened line is wider and shallower.`
      ],
      formulas: [
        { note: R`$x=\Delta\lambda/\Delta\lambda_{\max}$, valid for $|x|\le 1$ (zero outside)`, tex: R`G(x)=\frac{2(1-\epsilon)\sqrt{1-x^{2}}+\frac{\pi\epsilon}{2}\left(1-x^{2}\right)}{\pi\left(1-\epsilon/3\right)}` },
        { note: 'half-width of the line', tex: R`\Delta\lambda_{\max}=\lambda_0\,\frac{v\sin i}{c}` },
        { note: 'observed profile', tex: R`F(\lambda)=1-d\int_{-1}^{1}G(x)\,g\!\left(\lambda-\lambda_c-x\,\Delta\lambda_{\max}\right)dx` }
      ],
      sim: R`The code sums 200 to 4000 strips, each a Gaussian of width $\sigma$ at its own wavelength, and checks against a brute-force sum over every pixel of the disk in the tests.`,
      refs: [GRAY, SHAJN],
      see: ['limb', 'intrinsic']
    },
    intrinsic: {
      title: 'Intrinsic line: depth and width',
      what: 'What a small patch of the star would show, before rotation.',
      theory: [
        R`The line is a Gaussian with depth $d$ and width $\sigma$. Thermal motion of the atoms, small-scale turbulence and the resolution of the spectrograph all contribute, and they add in quadrature. Its FWHM is $2\sqrt{2\ln2}\,\sigma\approx2.355\,\sigma$.`,
        R`Rotation matters when $v\sin i$ is larger than $\sigma$. For slow rotators the line stays Gaussian.`
      ],
      formulas: [
        { note: 'intrinsic line, peak-normalised', tex: R`g(u)=\exp\!\left(-\frac{u^{2}}{2\sigma_\lambda^{2}}\right),\qquad \sigma_\lambda=\lambda\,\frac{\sigma_v}{c}` },
        { note: 'equivalent width, unchanged by rotation', tex: R`W=d\,\sigma_\lambda\sqrt{2\pi}` }
      ],
      sim: R`The width is set in km/s and converted to nm at the wavelength of each line, so it scales with $\lambda_{\rm obs}$ in panel C.`,
      refs: [GRAY],
      see: ['kernel']
    },
    combined: {
      title: 'Radial motion and rotation together',
      what: 'The two effects act at different levels, so they simply compose: the centre moves, the width grows.',
      theory: [
        R`The whole star moves with $v_r$, so every strip of the disk is shifted by the same factor $1+z$. On top of that, each strip has its own $v_{\rm los}$. The centre of the broadened line is therefore at $\lambda_{\rm obs}$ and its half-width is $\lambda_{\rm obs}\,v\sin i/c$.`,
        R`Do not mix them up: $v_r$ is one number for the whole star and tells how fast it moves towards or away from us. $v\sin i$ is the half-range of velocities across its disk and tells how fast it spins. A star can have $v_r=0$ and a broad line, or a large $v_r$ and a narrow one.`
      ],
      formulas: [
        { note: 'centre', tex: R`\lambda_c=\lambda_0(1+z)` },
        { note: 'half-width in the observer frame', tex: R`\Delta\lambda_{\max}=\lambda_{\rm obs}\,\frac{v\sin i}{c}` }
      ],
      sim: R`The centroid readout stays at $\lambda_{\rm obs}$ for every $v\sin i$, because $G$ is symmetric. If the shift is very large the plot follows the shifted line only.`,
      refs: [GRAY],
      see: ['doppler', 'kernel']
    }
  };

  return { tips, bind, panels, topics };
})();
