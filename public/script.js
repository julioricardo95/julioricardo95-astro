let menu = document.querySelector('#menu-icon');
let navbar = document.querySelector('.section_nav_list');

let dark = document.querySelector('#dark-botton');
let darkbar = document.querySelector('.dark-botton');

menu.addEventListener('click', function() {
    menu.classList.toggle('bx-x');
	navbar.classList.toggle('open');
})

dark.addEventListener('click',function(){
    dark.classList.toggle('fa-moon');
    darkbar.classList.toggle('dark');
})



console.log('hola');

/*

// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-analytics.js";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries
  
// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
    apiKey: "AIzaSyBbcqm4fTHcATMS5Tpv94KVdyJD1jE_Lkk",
    authDomain: "julio-ricardo95.firebaseapp.com",
    projectId: "julio-ricardo95",
    storageBucket: "julio-ricardo95.appspot.com",
    messagingSenderId: "659849342205",
    appId: "1:659849342205:web:8dd082f99f34d25b786294",
    measurementId: "G-13R0P9G0QG"
    };
  
// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
*/