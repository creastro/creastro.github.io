const toggle = document.querySelector(".theme-toggle");
const icon = document.querySelector(".theme-icon");
const year = document.querySelector("#year");

year.textContent = new Date().getFullYear();

toggle.addEventListener("click", () => {
  document.body.classList.toggle("dark");
  icon.textContent = document.body.classList.contains("dark") ? "☾" : "☼";
});
