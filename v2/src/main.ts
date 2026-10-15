import { mount } from 'svelte';
import './theme.css';
import App from './App.svelte';

const cible = document.getElementById('app');
if (!cible) throw new Error('Élément #app introuvable dans index.html');

export default mount(App, { target: cible });
