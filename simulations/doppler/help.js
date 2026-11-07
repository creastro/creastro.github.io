/* Explanations for the Doppler simulation: tooltips, and theory, formulas and references per parameter.
   Rendered by ../shared/explain.js. Strings with backslashes use String.raw so that the TeX is written as is. */
window.SIM_HELP = (() => {
  const R = String.raw;
  const ads = (code) => 'https://ui.adsabs.harvard.edu/abs/' + code.replace(/&/g, '%26');

  const GRAY = { c: 'Gray, D. F. 2005, The Observation and Analysis of Stellar Photospheres, 3rd ed., Cambridge University Press' };
  const VOGT83 = { c: 'Vogt, S. S. & Penrod, G. D. 1983, PASP 95, 565, "Doppler imaging of spotted stars: application to the RS Canum Venaticorum star HR 1099"', u: ads('1983PASP...95..565V') };
  const VOGT87 = { c: 'Vogt, S. S., Penrod, G. D. & Hatzes, A. P. 1987, ApJ 321, 496, "Doppler images of rotating stars using maximum entropy image reconstruction"', u: ads('1987ApJ...321..496V') };
  const SNELLEN = { c: 'Snellen, I. A. G. et al. 2014, Nature 509, 63, "Fast spin of the young extrasolar planet beta Pictoris b"', u: ads('2014Natur.509...63S') };
  const CROSSFIELD = { c: 'Crossfield, I. J. M. et al. 2014, Nature 505, 654, "A global cloud map of the nearest known brown dwarf"', u: ads('2014Natur.505..654C') };
  const CLARET = { c: 'Claret, A. 2000, A&A 363, 1081, "A new non-linear limb-darkening law for LTE stellar atmosphere models"', u: ads('2000A&A...363.1081C') };
  const BERDYUGINA = { c: 'Berdyugina, S. V. 2005, Living Reviews in Solar Physics 2, 8, "Starspots: a key to the stellar dynamo"', u: ads('2005LRSP....2....8B') };

  const tips = {
    play: 'Pause or resume the rotation of the planet.',
    phase: 'Rotation phase, from 0 to 1 turn. Moving it pauses the animation.',
    period: 'Seconds the animation takes for one full rotation (not a physical period).',
    inc: 'Angle between the spin axis and the line of sight. 90° is equator-on.',
    veq: "Speed of the planet's equator. With the inclination it sets the width of the line.",
    sigma: 'Width of the line from a small patch of the surface, before rotation broadens it.',
    depth: 'How deep the absorption line is, as a fraction of the continuum.',
    ld: 'How much darker the edge of the disk is than its centre.',
    showVel: 'Tint the disk blue where the gas approaches and red where it recedes.',
    showGrid: 'Draw latitude and longitude lines that turn with the planet.',
    preset: 'Load the spin of a real planet or brown dwarf. The card below lists every source.',
    reset: 'Restore every parameter to its default value.'
  };
  const bind = { preset: 'presets', inc: 'inclination', veq: 'speed', sigma: 'linewidth', depth: 'depth', ld: 'limb' };
  ['A', 'B'].forEach((k) => {
    tips[k + '-type'] = 'Switch the spot off, or make it a dark or a bright patch.';
    tips[k + '-lat'] = 'Latitude of the spot centre. Positive is towards the north pole.';
    tips[k + '-lon'] = 'Longitude of the spot at phase 0. It sets when the spot comes into view.';
    tips[k + '-size'] = 'Angular radius of the spot on the surface of the planet.';
    tips[k + '-contrast'] = 'How much dimmer (dark spot) or brighter (bright spot) the spot is than its surroundings.';
    bind[k + '-type'] = 'spot-contrast';
    bind[k + '-contrast'] = 'spot-contrast';
    bind[k + '-lat'] = 'spot-position';
    bind[k + '-lon'] = 'spot-position';
    bind[k + '-size'] = 'spot-size';
  });

  const panels = { 't-planet': 'planet', 't-profile': 'profile', 't-wf': 'dynamic' };

  const topics = {
    planet: {
      title: 'The rotating planet and the Doppler shift',
      what: 'A spinning planet is not resolved by the spectrograph: all its light arrives together. But every part of the surface moves at a different speed along our line of sight, so its light is shifted in wavelength by a different amount.',
      theory: [
        R`Light from gas moving towards us is shifted to shorter wavelengths (blueshift) and light from gas moving away to longer wavelengths (redshift). For speeds much smaller than $c$ the shift is $\Delta\lambda/\lambda = v_{\rm los}/c$.`,
        R`Only the component of the velocity along the line of sight matters. For a sphere rotating rigidly, that component depends only on where the point is across the disk, measured perpendicular to the projected spin axis, and not on its latitude. The left limb approaches and the right limb recedes in this simulation.`
      ],
      formulas: [
        { note: 'Doppler shift (non-relativistic)', tex: R`\frac{\Delta\lambda}{\lambda} = \frac{v_{\rm los}}{c}` },
        { note: 'line-of-sight speed of the surface at horizontal position $x$ on the disk, in units of the radius', tex: R`v_{\rm los} = v_{\rm eq}\,\sin i\;x` },
        { note: 'spin axis seen from the observer (sky frame: $x$ right, $y$ up, $z$ towards us)', tex: R`\hat{\mathbf s} = (0,\ \sin i,\ \cos i)` }
      ],
      sim: R`Each pixel of the disk is shifted by $v_{\rm eq}\sin i\,x$. The disk is tinted blue and red by this velocity when you switch on "Colour by velocity".`,
      refs: [GRAY, SNELLEN],
      see: ['inclination', 'speed', 'profile']
    },
    inclination: {
      title: 'Inclination i',
      what: 'The angle between the rotation axis and the line of sight. At i = 90° the planet is seen equator-on, at i = 0° pole-on.',
      theory: [
        R`A spectrum only measures the speed along the line of sight, so it constrains the product $v_{\rm eq}\sin i$ (often written $v\sin i$), not the true equatorial speed. Seen pole-on, nothing moves along the line of sight, so there is no rotational Doppler shift at all.`,
        R`If the radius $R$ and the rotation period $P$ are known, for example from brightness variations, the inclination follows from $v\sin i$. This is how the spin of the young planet beta Pictoris b was measured.`
      ],
      formulas: [
        { note: 'projected equatorial speed', tex: R`v\sin i = \frac{2\pi R}{P}\,\sin i` },
        { note: R`tilt of the body frame: the spin axis is rotated by $90^\circ - i$ about the $x$ axis`, tex: R`\mathbf r = R_x(90^\circ - i)\,R_y(\alpha)\,\mathbf p` }
      ],
      sim: R`The page shows $v\sin i$ in the corner of the planet panel. With a low inclination the spots stay close to the centre of the disk and their Doppler shifts are small.`,
      refs: [GRAY, SNELLEN],
      see: ['speed', 'spot-position']
    },
    speed: {
      title: 'Equatorial speed',
      what: R`How fast the equator moves, in km/s. With the inclination it sets the width of the rotationally broadened line, which spans from $-v\sin i$ to $+v\sin i$.`,
      theory: [
        R`For a rigid sphere of radius $R$ and period $P$, $v_{\rm eq} = 2\pi R/P$. Jupiter turns in 9.9 h with a radius of 71 500 km, which gives about 12.6 km/s. The young planet beta Pictoris b spins much faster: its $v\sin i$ is about 25 km/s.`,
        R`Rotation broadens a line into a profile with a rounded, nearly elliptical shape. Its exact form depends on limb darkening: with the linear coefficient $\epsilon$ (here $u$), the broadening function is given below (Gray 2005).`
      ],
      formulas: [
        { note: 'equatorial speed', tex: R`v_{\rm eq} = \frac{2\pi R}{P}` },
        { note: R`rotational broadening function, for $|\Delta v| < v\sin i$ (the velocity offset is $x=\Delta v/v\sin i$)`, tex: R`G(\Delta v)=\frac{N(x)}{\pi\,v\sin i\,\left(1-\epsilon/3\right)}` },
        { tex: R`\begin{aligned}N(x)&=2(1-\epsilon)\sqrt{1-x^{2}}\\&\quad+\tfrac{\pi\epsilon}{2}\left(1-x^{2}\right)\end{aligned}` }
      ],
      sim: R`The line profile is built pixel by pixel from the disk, so it follows this broadening function without assuming it.`,
      refs: [GRAY, SNELLEN],
      see: ['inclination', 'limb', 'linewidth']
    },
    linewidth: {
      title: 'Intrinsic line width σ',
      what: 'The width of the line produced by a small patch of the surface, before rotation spreads it out.',
      theory: [
        R`It collects several effects: thermal motion of the absorbing atoms and molecules, pressure broadening, small-scale turbulence in the atmosphere, and the finite resolution of the spectrograph. In a first approximation each is Gaussian and they add in quadrature.`,
        R`An instrument of resolving power $\mathcal R=\lambda/\Delta\lambda$ has a Gaussian width $\sigma_{\rm inst} = c/(2.355\,\mathcal R)$ in velocity. For $\mathcal R=10^5$ this is about 1.3 km/s, so very fast rotation is needed before spots can be told apart from the line width.`
      ],
      formulas: [
        { note: 'Gaussian line shape', tex: R`g(v)=e^{-v^{2}/2\sigma^{2}}` },
        { note: 'full width at half maximum', tex: R`{\rm FWHM}=2\sqrt{2\ln 2}\,\sigma\simeq2.355\,\sigma` },
        { note: 'contributions add in quadrature', tex: R`\sigma^{2}=\sigma_{\rm th}^{2}+\sigma_{\rm turb}^{2}+\sigma_{\rm inst}^{2}` },
        { note: 'thermal width of atoms or molecules of mass $m$ at temperature $T$', tex: R`\sigma_{\rm th}=\sqrt{k_{\rm B}T/m}` },
        { note: 'observed profile: the line convolved with the rotation', tex: R`F(v)=1-d\,(G\ast g)(v)` }
      ],
      sim: R`A larger σ smooths the bump that a spot makes in the profile. Below about 1 km/s the profile is limited by the pixel sampling of the disk.`,
      refs: [GRAY],
      see: ['speed', 'depth']
    },
    depth: {
      title: 'Line depth d',
      what: 'How much light the line absorbs at its centre, as a fraction of the continuum. A depth of 0.5 means that half of the light is absorbed.',
      theory: [
        R`Rotation does not change the total absorption, only how it is spread in wavelength. The equivalent width, the area between the continuum and the profile, is conserved. That is why a broad rotation profile is shallow.`,
        R`In real planets and brown dwarfs the depth depends on the temperature, pressure and composition of the layer that makes the line, so a cooler or cloudier spot can change the line as well as the continuum. This simulation keeps the intrinsic depth fixed, and spots only change the brightness.`
      ],
      formulas: [
        { note: 'profile of a single patch', tex: R`F(v)=1-d\,g(v)` },
        { note: 'equivalent width of a Gaussian line, unchanged by rotation', tex: R`W=\int\left[1-F(v)\right]dv = d\,\sigma\sqrt{2\pi}` }
      ],
      refs: [GRAY],
      see: ['linewidth', 'profile']
    },
    limb: {
      title: 'Limb darkening u',
      what: 'The edge of a planet or star looks darker than its centre. Near the limb we see higher, cooler layers at a slant.',
      theory: [
        R`Along a slanted line of sight the optical depth reaches unity higher up in the atmosphere, where it is cooler, so less light is emitted. The simplest description is the linear law below, with $\mu=\cos\theta$ the cosine of the angle between the line of sight and the surface normal. More accurate non-linear laws exist (Claret 2000).`,
        R`Limb darkening reduces the weight of the regions that carry the largest Doppler shifts. It makes the profile more peaked, and it makes a spot near the limb much less visible than one at the centre.`
      ],
      formulas: [
        { note: 'linear limb-darkening law', tex: R`I(\mu)=I_0\left[1-u\,(1-\mu)\right]` },
        { note: 'cosine of the angle between the line of sight and the surface normal', tex: R`\mu=\sqrt{1-x^{2}-y^{2}}` },
        { note: 'flux of the whole disk', tex: R`F=\pi I_0\left(1-\frac{u}{3}\right)` }
      ],
      sim: R`Every pixel is weighted by $I(\mu)$ when the profile is summed.`,
      refs: [CLARET, GRAY],
      see: ['speed', 'spot-size']
    },
    'spot-contrast': {
      title: 'Spot type and contrast',
      what: 'A spot is a region of the surface that emits more or less light than its surroundings: a dark spot is cooler or cloudier, a bright spot is hotter or clearer.',
      theory: [
        R`On stars, dark spots are cool regions where magnetic fields suppress convection. On brown dwarfs and giant planets, patchy clouds and temperature differences change how much light escapes. Doppler imaging uses the way these patches move through the line profile to map them (Vogt & Penrod 1983, Crossfield et al. 2014).`,
        R`For a spot at temperature $T_{\rm s}$ on a surface at $T_{\rm p}$, the brightness contrast at wavelength $\lambda$ follows from the Planck function.`
      ],
      formulas: [
        { note: 'contrast of a spot (negative for a dark spot)', tex: R`c=\frac{B_\lambda(T_{\rm s})}{B_\lambda(T_{\rm p})}-1` },
        { note: 'Planck function', tex: R`B_\lambda(T)=\frac{2hc^{2}}{\lambda^{5}}\,\frac{1}{e^{hc/\lambda k_{\rm B}T}-1}` },
        { note: 'intensity used here, with a smooth edge profile $w$ going from 1 to 0', tex: R`I=I_0\left[1-u(1-\mu)\right]\left[1+c\,w\right]` }
      ],
      sim: R`The contrast slider is $|c|$ in per cent. A dark spot with a contrast of 70 % emits 30 % of the light of its surroundings. A spot changes the continuum only, not the line depth.`,
      refs: [VOGT83, CROSSFIELD, BERDYUGINA],
      see: ['spot-position', 'spot-size', 'profile']
    },
    'spot-position': {
      title: 'Spot latitude and longitude',
      what: 'Where the spot sits on the planet. Latitude is measured from the equator towards the north pole, and longitude from the meridian that faces us at phase 0.',
      theory: [
        R`As the planet rotates by an angle $\alpha=2\pi\,\text{phase}$, the spot moves across the disk. Its horizontal position $x$ gives its Doppler shift, so the shift follows a sine curve in time. Its height tells us how far it is from the equator, but with a catch: at i = 90° a spot at latitude +φ and one at −φ have the same $x$ and give identical signals.`,
        R`Lowering the inclination breaks this north-south ambiguity, because the spot's path across the disk then depends on its latitude.`
      ],
      formulas: [
        { note: R`position of a spot in the frame of the planet (latitude $\phi$, longitude $\lambda$)`, tex: R`\mathbf p=(\cos\phi\sin\lambda,\ \sin\phi,\ \cos\phi\cos\lambda)` },
        { note: R`position on the sky after rotation by $\alpha$; the spot is visible when $r_z>0$`, tex: R`\mathbf r=R_x(90^\circ-i)\,R_y(\alpha)\,\mathbf p` },
        { note: 'Doppler shift of the spot', tex: R`v_{\rm spot}=v\sin i\;r_x` }
      ],
      sim: R`The dotted line over the dynamic spectrum is $v_{\rm spot}$ as a function of phase, drawn where the spot is on the visible side.`,
      refs: [VOGT83, VOGT87, CROSSFIELD],
      see: ['inclination', 'dynamic']
    },
    'spot-size': {
      title: 'Spot size',
      what: 'The angular radius of the spot on the surface of the planet. Bigger spots hide more light and leave a stronger signal in the profile.',
      theory: [
        R`The signal of a small spot is the light it removes (or adds) relative to the light of the whole disk. Its area on the sky is smaller than on the planet because of foreshortening: it is multiplied by $\mu$, the cosine of the angle from the disk centre. A spot at the limb is therefore weak, and also sits on the darkened edge.`,
        R`That is why the signal is largest when the spot crosses the middle of the disk, where the Doppler shift is small, and fades as it approaches the limb, where the shift is largest.`
      ],
      formulas: [
        { note: R`fractional change of the flux for a small spot of angular radius $\rho$ (in radians) at $\mu$`, tex: R`\frac{\Delta F}{F}\simeq c\,\rho^{2}\,\mu\,\frac{1-u(1-\mu)}{1-u/3}` }
      ],
      sim: R`The spot has a smooth edge: full contrast inside 65 % of its radius, falling to zero at the radius.`,
      refs: [BERDYUGINA, GRAY],
      see: ['limb', 'spot-contrast']
    },
    profile: {
      title: 'Disk-integrated line profile',
      what: 'The line as the spectrograph sees it: the light of the whole disk, with every pixel shifted by its own Doppler velocity, divided by the continuum.',
      theory: [
        R`Without spots the profile is the rotation broadening function convolved with the intrinsic line. A dark spot hides light that would have been absorbed at its velocity, so the line is shallower there and a bump appears. A bright spot adds weight at its velocity, so the line is deeper there and a dip appears.`,
        R`Because the profile is divided by the total continuum, a dark spot also makes the rest of the line look very slightly deeper. This is the faint opposite-sign halo around the bump.`
      ],
      formulas: [
        { note: 'continuum-normalised profile, summed over the pixels of the disk', tex: R`F(v)=1-d\,\frac{\sum_{\rm pix} I(x,y)\,g\!\left(v-v_{\rm pix}\right)}{\sum_{\rm pix} I(x,y)}` },
        { note: 'velocity of a pixel', tex: R`v_{\rm pix}=v\sin i\;x` }
      ],
      sim: R`The dashed curve is the same planet without spots. The lower plot shows the difference between the two.`,
      refs: [GRAY, VOGT83],
      see: ['dynamic', 'linewidth', 'depth']
    },
    dynamic: {
      title: 'Dynamic spectrum',
      what: 'The difference between the spotted and the spotless profile for every rotation phase, shown as a map: velocity across, phase down.',
      theory: [
        R`A spot appears as a streak that goes from blueshift to redshift as it crosses the disk, then disappears behind the limb and comes back one rotation later. The position of the streak gives the longitude and, through the shape of the track, the latitude. Its brightness gives the size and contrast.`,
        R`Doppler imaging turns this around: from a series of line profiles measured at many phases it reconstructs a map of the surface, by solving an inverse problem with regularisation (maximum entropy in Vogt et al. 1987). The method was first used on starspots, and Crossfield et al. (2014) applied it to map the clouds of a nearby brown dwarf.`
      ],
      formulas: [
        { note: R`residual for each rotation phase $\varphi$`, tex: R`\Delta F(v,\varphi)=F_{\rm spots}(v,\varphi)-F_{\rm ref}(v)` },
        { note: 'rotation angle', tex: R`\alpha=2\pi\,\varphi` }
      ],
      sim: R`Orange means that the line is shallower than without spots (a dark spot). Blue means that it is deeper (a bright spot).`,
      refs: [VOGT83, VOGT87, CROSSFIELD],
      see: ['spot-position', 'profile']
    }
  };

  topics.presets = {
    title: 'Real objects: where the presets come from',
    what: 'Each preset sets only two numbers: the inclination $i$ and the equatorial speed $v_{\\rm eq}$. Line width and depth, limb darkening and spots are not measured for these objects, so they keep your settings.',
    theory: [
      R`Neither the NASA Exoplanet Archive nor Exoplanet.eu lists the spin of a planet. The spin comes from papers found through ADS: a measured $v\sin i$, or a rotation period $P$ with a radius $R$. Orbital elements, radii and the other catalog values come from the two catalogs.`,
      R`When a value exists in several NASA parameter sets, the one with the most recent reference is used. Exoplanet.eu gives no reference for each value, so it cannot take part in that comparison: it is shown beside the NASA value, flagged when the two differ by more than 10%, and used only if NASA has no value.`,
      R`The spin inclination is the measured one when there is one. Otherwise the spin is assumed parallel to the orbit, so the orbital inclination is folded into 0-90 degrees (the spectrum cannot tell $i$ from $180^\circ - i$). If even that is unknown, $i = 90^\circ$ is assumed. Every number carries a tag: measured, derived, assumed or catalog.`
    ],
    formulas: [
      { note: R`equatorial speed from a measured projected speed`, tex: R`v_{\rm eq} = \frac{v\sin i}{\sin i}` },
      { note: R`equatorial speed from a period and a radius`, tex: R`v_{\rm eq} = \frac{2\pi R}{P}` }
    ],
    sim: R`Choosing a preset moves the inclination and speed sliders. Moving either slider yourself marks the card as modified. Uncertainties are propagated linearly and are large when $i$ is small, as for HD 106906 b.`,
    refs: [
      { c: 'NASA Exoplanet Archive, Akeson, R. L. et al. 2013, PASP 125, 989', u: ads('2013PASP..125..989A') },
      { c: 'Schneider, J. et al. 2011, A&A 532, A79, "Defining and cataloging exoplanets: the exoplanet.eu database"', u: ads('2011A&A...532A..79S') },
      SNELLEN
    ],
    see: ['inclination', 'speed']
  };

  return { tips, bind, panels, topics };
})();
