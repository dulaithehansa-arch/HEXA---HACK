import { auth, db } from "./firebase-config.js";
import {
    onAuthStateChanged,
    signInWithEmailAndPassword,
    signOut
} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-auth.js";
import {
    addDoc,
    collection,
    doc,
    getDocs,
    onSnapshot,
    query,
    serverTimestamp,
    where,
    writeBatch
} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js";

(() => {
    'use strict';

    const locations = {
        Dambulla: { lat: 7.87, lng: 80.65 },
        Anuradhapura: { lat: 8.31, lng: 80.40 },
        Jaffna: { lat: 9.66, lng: 80.02 },
        Kandy: { lat: 7.29, lng: 80.63 },
        Badulla: { lat: 6.99, lng: 81.06 },
        Ampara: { lat: 7.30, lng: 81.67 },
        Galle: { lat: 6.05, lng: 80.22 },
        Kurunegala: { lat: 7.49, lng: 80.36 },
        Polonnaruwa: { lat: 7.94, lng: 81.00 },
        Matale: { lat: 7.47, lng: 80.62 },
        Colombo: { lat: 6.93, lng: 79.85 },
        Negombo: { lat: 7.21, lng: 79.84 },
        NuwaraEliya: { lat: 6.95, lng: 80.78 },
        Ratnapura: { lat: 6.68, lng: 80.40 }
    };
    const locationLabels = {
        Dambulla: 'Dambulla',
        Anuradhapura: 'Anuradhapura',
        Jaffna: 'Jaffna',
        Kandy: 'Kandy',
        Badulla: 'Badulla',
        Ampara: 'Ampara',
        Galle: 'Galle',
        Kurunegala: 'Kurunegala',
        Polonnaruwa: 'Polonnaruwa',
        Matale: 'Matale',
        Colombo: 'Colombo',
        Negombo: 'Negombo',
        NuwaraEliya: 'Nuwara Eliya',
        Ratnapura: 'Ratnapura'
    };

    const initialData = {
        farmers: [
            { id: 'f1', name: 'Nimal Perera', product: 'Rice', quantity: 4200, price: 145, location: 'Dambulla' },
            { id: 'f2', name: 'Saman Kumara', product: 'Tomato', quantity: 1800, price: 165, location: 'Matale' },
            { id: 'f3', name: 'Kumari Silva', product: 'Potato', quantity: 2500, price: 210, location: 'NuwaraEliya' },
            { id: 'f4', name: 'Ruwan Jayasuriya', product: 'Onion', quantity: 3200, price: 175, location: 'Dambulla' },
            { id: 'f5', name: 'Anura Fernando', product: 'Carrot', quantity: 1300, price: 190, location: 'Badulla' },
            { id: 'f6', name: 'Thilini Rajapaksha', product: 'Banana', quantity: 2800, price: 120, location: 'Ampara' },
            { id: 'f7', name: 'Sunil Bandara', product: 'Chili', quantity: 900, price: 245, location: 'Anuradhapura' },
            { id: 'f8', name: 'Mala Wijesinghe', product: 'Cabbage', quantity: 1600, price: 135, location: 'Kandy' },
            { id: 'f9', name: 'Chamara Senanayake', product: 'Rice', quantity: 3500, price: 155, location: 'Polonnaruwa' },
            { id: 'f10', name: 'Iresha Gunawardena', product: 'Tomato', quantity: 2100, price: 155, location: 'Kurunegala' }
        ],
        buyers: [
            { id: 'b1', name: 'Green Basket Co.', product: 'Rice', quantity: 5000, maxPrice: 175, location: 'Colombo' },
            { id: 'b2', name: 'FreshMart Kandy', product: 'Tomato', quantity: 2200, maxPrice: 185, location: 'Kandy' },
            { id: 'b3', name: 'Hill Country Foods', product: 'Potato', quantity: 3000, maxPrice: 230, location: 'Kandy' },
            { id: 'b4', name: 'Southern Harvest', product: 'Banana', quantity: 1800, maxPrice: 145, location: 'Galle' },
            { id: 'b5', name: 'City Grocers', product: 'Onion', quantity: 2600, maxPrice: 195, location: 'Negombo' }
        ]
    };
    const LEGACY_STORAGE_KEY = 'agrilink-demo-v1';

    let data = { farmers: [], buyers: [] };
    let currentUser = null;
    let harvestChart = null;
    let unsubscribeFarmers = null;
    let unsubscribeBuyers = null;
    const numberFormat = new Intl.NumberFormat('en-LK');
    const formatNumber = value => numberFormat.format(Math.round(value));
    const formatMoney = value => `₨ ${formatNumber(value)}`;
    const getLocationName = key => locationLabels[key] || key;
    const byId = id => document.getElementById(id);
    const initials = name => name.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();
    const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[char]));

    function distanceBetween(firstKey, secondKey) {
        const first = locations[firstKey];
        const second = locations[secondKey];
        if (!first || !second) return Infinity;
        const toRadians = degrees => degrees * Math.PI / 180;
        const latitudeDifference = toRadians(second.lat - first.lat);
        const longitudeDifference = toRadians(second.lng - first.lng);
        const value = Math.sin(latitudeDifference / 2) ** 2
            + Math.cos(toRadians(first.lat)) * Math.cos(toRadians(second.lat))
            * Math.sin(longitudeDifference / 2) ** 2;
        return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
    }

    function getMatches() {
        const matches = [];
        for (const farmer of data.farmers) {
            for (const buyer of data.buyers) {
                if (farmer.product !== buyer.product || farmer.price > buyer.maxPrice) continue;
                const distance = distanceBetween(farmer.location, buyer.location);
                const priceFit = 100 - 50 * (farmer.price / buyer.maxPrice);
                const distanceFit = Math.max(0, 100 * (1 - distance / 500));
                const supplyCoverage = Math.min(1, farmer.quantity / buyer.quantity) * 100;
                const score = Math.round(priceFit * 0.35 + distanceFit * 0.45 + supplyCoverage * 0.20);
                matches.push({
                    farmer,
                    buyer,
                    distance,
                    priceFit,
                    supplyCoverage,
                    score
                });
            }
        }
        return matches.sort((a, b) => b.score - a.score || a.distance - b.distance);
    }

    function getAllocations(matches) {
        const available = new Map(data.farmers.map(farmer => [farmer.id, Number(farmer.quantity)]));
        const remaining = new Map(data.buyers.map(buyer => [buyer.id, Number(buyer.quantity)]));
        const allocations = [];
        for (const match of matches) {
            const farmerRemaining = available.get(match.farmer.id) || 0;
            const buyerRemaining = remaining.get(match.buyer.id) || 0;
            const quantity = Math.min(farmerRemaining, buyerRemaining);
            if (quantity <= 0) continue;
            allocations.push({ ...match, quantity });
            available.set(match.farmer.id, farmerRemaining - quantity);
            remaining.set(match.buyer.id, buyerRemaining - quantity);
        }
        return {
            allocations,
            remaining,
            totalAllocated: allocations.reduce((sum, item) => sum + item.quantity, 0)
        };
    }

    function personCell(name, subtitle, buyer = false) {
        return `<div class="person-cell"><span class="mini-avatar ${buyer ? 'buyer' : ''}">${escapeHtml(initials(name))}</span><span><strong>${escapeHtml(name)}</strong><small>${escapeHtml(subtitle)}</small></span></div>`;
    }

    function scoreCell(score) {
        return `<div class="score-cell"><span class="score-track"><span class="score-fill" style="width:${score}%"></span></span><span class="score-number">${score}%</span></div>`;
    }

    function readLegacyData() {
        try {
            const saved = localStorage.getItem(LEGACY_STORAGE_KEY);
            if (!saved) return null;
            const parsed = JSON.parse(saved);
            if (!Array.isArray(parsed.farmers) || !Array.isArray(parsed.buyers)) {
                throw new Error('Saved browser data has an invalid shape.');
            }
            return parsed;
        } catch (error) {
            console.error('Unable to read existing browser data for migration:', error);
            showFirebaseNotice(`Existing browser data could not be imported: ${error.message}`);
            return null;
        }
    }

    function renderNavigationCounts() {
        const farmers = byId('farmersNavCount');
        const buyers = byId('buyersNavCount');
        if (farmers) farmers.textContent = data.farmers.length;
        if (buyers) buyers.textContent = data.buyers.length;
    }

    function renderDashboard(matches) {
        const totalSupply = data.farmers.reduce((sum, farmer) => sum + Number(farmer.quantity), 0);
        const demandByProduct = data.buyers.reduce((counts, buyer) => {
            counts[buyer.product] = (counts[buyer.product] || 0) + Number(buyer.quantity);
            return counts;
        }, {});
        const demandEntries = Object.entries(demandByProduct).sort((a, b) => b[1] - a[1]);
        const maxDemand = Math.max(1, ...demandEntries.map(entry => entry[1]));

        if (byId('dashboardFarmerCount')) byId('dashboardFarmerCount').textContent = data.farmers.length;
        if (byId('dashboardBuyerCount')) byId('dashboardBuyerCount').textContent = data.buyers.length;
        if (byId('dashboardMatchCount')) byId('dashboardMatchCount').textContent = matches.length;
        if (byId('dashboardSupply')) byId('dashboardSupply').textContent = formatNumber(totalSupply);

        if (byId('demandList')) {
            byId('demandList').innerHTML = demandEntries.length
                ? demandEntries.map(([product, quantity]) => `<div><div class="demand-row-head"><span>${escapeHtml(product)}</span><span>${formatNumber(quantity)} kg</span></div><div class="progress-track"><div class="progress-fill" style="width:${Math.max(4, quantity / maxDemand * 100)}%"></div></div></div>`).join('')
                : '<p class="muted">No buyer requests have been added.</p>';
        }

        const table = byId('dashboardMatches');
        if (table) {
            table.innerHTML = matches.slice(0, 4).map(match => `<tr><td>${personCell(match.farmer.name, getLocationName(match.farmer.location))}</td><td><span class="crop-tag">${escapeHtml(match.farmer.product)}</span></td><td>${personCell(match.buyer.name, getLocationName(match.buyer.location), true)}</td><td>${formatNumber(Math.min(match.farmer.quantity, match.buyer.quantity))} kg</td><td>${Math.round(match.distance)} km</td><td>${scoreCell(match.score)}</td></tr>`).join('');
            if (!matches.length) table.innerHTML = '<tr><td colspan="6" class="empty-state">No eligible matches. Add compatible supply or demand.</td></tr>';
        }

        const canvas = byId('harvestChart');
        if (canvas && window.Chart) {
            const context = canvas.getContext('2d');
            if (harvestChart) harvestChart.destroy();
            harvestChart = new window.Chart(context, {
                type: 'line',
                data: {
                    labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
                    datasets: [{
                        label: 'Harvest Volume Trends (kg)',
                        data: [120, 190, 300, 250, 420, 500, 480, 390, 310, 280, 200, 150],
                        borderColor: '#10B981',
                        backgroundColor: 'rgba(16, 185, 129, 0.1)',
                        fill: true,
                        tension: 0.4,
                        pointRadius: 2.5,
                        pointHoverRadius: 5,
                        borderWidth: 2
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                        x: { grid: { display: false }, ticks: { color: '#98a69e', font: { size: 9 } } },
                        y: { beginAtZero: true, grid: { color: '#eff3f0' }, ticks: { color: '#98a69e', font: { size: 9 }, maxTicksLimit: 5 } }
                    }
                }
            });
        } else if (canvas) {
            canvas.insertAdjacentHTML('afterend', '<p class="muted">Chart.js could not load. Check your internet connection.</p>');
        }
    }

    function renderFarmers() {
        const search = (byId('farmerSearch')?.value || '').trim().toLowerCase();
        const filtered = data.farmers.filter(farmer => `${farmer.name} ${farmer.product} ${getLocationName(farmer.location)}`.toLowerCase().includes(search));
        const table = byId('farmersTable');
        if (table) {
            table.innerHTML = filtered.map(farmer => `<tr><td>${personCell(farmer.name, `Supplier · ${getLocationName(farmer.location)}`)}</td><td><span class="crop-tag">${escapeHtml(farmer.product)}</span></td><td><strong>${formatNumber(farmer.quantity)} kg</strong></td><td>${formatMoney(farmer.price)} / kg</td><td>${escapeHtml(getLocationName(farmer.location))}</td><td><span class="status-tag">Available</span></td></tr>`).join('');
            if (!filtered.length) table.innerHTML = `<tr><td colspan="6" class="empty-state">${search ? 'No farmers match your search.' : 'No farmers have been added.'}</td></tr>`;
        }
        if (byId('farmersPageCount')) byId('farmersPageCount').textContent = data.farmers.length;
        if (byId('farmersPageSupply')) byId('farmersPageSupply').textContent = formatNumber(data.farmers.reduce((sum, farmer) => sum + Number(farmer.quantity), 0));
        if (byId('farmersCropCount')) byId('farmersCropCount').textContent = new Set(data.farmers.map(farmer => farmer.product)).size;
    }

    function renderBuyers() {
        const search = (byId('buyerSearch')?.value || '').trim().toLowerCase();
        const filtered = data.buyers.filter(buyer => `${buyer.name} ${buyer.product} ${getLocationName(buyer.location)}`.toLowerCase().includes(search));
        const table = byId('buyersTable');
        if (table) {
            table.innerHTML = filtered.map(buyer => `<tr><td>${personCell(buyer.name, `Buyer · ${getLocationName(buyer.location)}`, true)}</td><td><span class="crop-tag">${escapeHtml(buyer.product)}</span></td><td><strong>${formatNumber(buyer.quantity)} kg</strong></td><td>${formatMoney(buyer.maxPrice)} / kg</td><td>${escapeHtml(getLocationName(buyer.location))}</td><td><span class="status-tag">Open</span></td></tr>`).join('');
            if (!filtered.length) table.innerHTML = `<tr><td colspan="6" class="empty-state">${search ? 'No buyer requests match your search.' : 'No buyer requests have been added.'}</td></tr>`;
        }
        const totalDemand = data.buyers.reduce((sum, buyer) => sum + Number(buyer.quantity), 0);
        const averagePrice = data.buyers.length ? data.buyers.reduce((sum, buyer) => sum + Number(buyer.maxPrice), 0) / data.buyers.length : 0;
        if (byId('buyersPageCount')) byId('buyersPageCount').textContent = data.buyers.length;
        if (byId('buyersPageDemand')) byId('buyersPageDemand').textContent = formatNumber(totalDemand);
        if (byId('buyersAveragePrice')) byId('buyersAveragePrice').textContent = formatNumber(averagePrice);
    }

    function renderMatches(matches) {
        const search = (byId('matchSearch')?.value || '').trim().toLowerCase();
        const filtered = matches.filter(match => `${match.farmer.name} ${match.buyer.name} ${match.farmer.product}`.toLowerCase().includes(search));
        const table = byId('matchesTable');
        if (table) {
            table.innerHTML = filtered.map((match, index) => `<tr><td><strong>#${String(index + 1).padStart(2, '0')}</strong></td><td>${personCell(match.farmer.name, `to ${match.buyer.name}`)}</td><td><span class="crop-tag">${escapeHtml(match.farmer.product)}</span></td><td><span class="score-breakdown">${formatMoney(match.farmer.price)} / ${formatMoney(match.buyer.maxPrice)} max</span></td><td>${Math.round(match.distance)} km</td><td>${scoreCell(match.score)}</td></tr>`).join('');
            if (!filtered.length) table.innerHTML = '';
        }
        if (byId('noMatchesMessage')) byId('noMatchesMessage').classList.toggle('hidden', filtered.length > 0);
        if (byId('matchesPageCount')) byId('matchesPageCount').textContent = matches.length;
        if (byId('strongMatchesCount')) byId('strongMatchesCount').textContent = matches.filter(match => match.score >= 75).length;
        if (byId('matchedCropCount')) byId('matchedCropCount').textContent = new Set(matches.map(match => match.farmer.product)).size;
    }

    function renderAllocations(matches) {
        const { allocations, remaining, totalAllocated } = getAllocations(matches);
        const totalDemand = data.buyers.reduce((sum, buyer) => sum + Number(buyer.quantity), 0);
        const stillNeeded = Array.from(remaining.values()).reduce((sum, quantity) => sum + quantity, 0);
        const fulfilled = data.buyers.filter(buyer => (remaining.get(buyer.id) || 0) === 0).length;
        const table = byId('allocationsTable');
        if (table) {
            table.innerHTML = allocations.map(item => `<tr><td>${personCell(item.farmer.name, getLocationName(item.farmer.location))}</td><td><span class="crop-tag">${escapeHtml(item.farmer.product)}</span></td><td>${personCell(item.buyer.name, getLocationName(item.buyer.location), true)}</td><td class="allocation-cell">${formatNumber(item.quantity)} kg</td><td>${formatMoney(item.farmer.price)} / kg</td><td>${scoreCell(item.score)}</td></tr>`).join('');
        }
        if (byId('noAllocationsMessage')) byId('noAllocationsMessage').classList.toggle('hidden', allocations.length > 0);
        if (byId('allocatedQuantity')) byId('allocatedQuantity').textContent = formatNumber(totalAllocated);
        if (byId('unfilledQuantity')) byId('unfilledQuantity').textContent = formatNumber(stillNeeded);
        if (byId('fulfilledRequestCount')) byId('fulfilledRequestCount').textContent = `${fulfilled} / ${data.buyers.length}`;
        if (byId('allocatedPercent')) byId('allocatedPercent').textContent = `${totalDemand ? Math.round(totalAllocated / totalDemand * 100) : 0}% of total requested demand`;
    }

    function fillLocationSelects() {
        document.querySelectorAll('select[name="location"]').forEach(select => {
            for (const [key, label] of Object.entries(locationLabels)) {
                const option = document.createElement('option');
                option.value = key;
                option.textContent = label;
                select.append(option);
            }
        });
    }

    async function addRecord(type, form) {
        const formData = new FormData(form);
        const errorElement = byId(`${type}FormError`);
        const record = {
            name: String(formData.get('name')).trim(),
            product: String(formData.get('product')),
            quantity: Number(formData.get('quantity')),
            location: String(formData.get('location'))
        };
        if (type === 'farmer') record.price = Number(formData.get('price'));
        else record.maxPrice = Number(formData.get('maxPrice'));

        if (!record.name || !record.product || !record.location || !Number.isFinite(record.quantity) || record.quantity <= 0
            || !Number.isFinite(type === 'farmer' ? record.price : record.maxPrice)
            || (type === 'farmer' ? record.price : record.maxPrice) <= 0) {
            errorElement.textContent = 'Enter a name, product, location, and positive quantity and price.';
            return;
        }

        if (!currentUser) {
            errorElement.textContent = 'Sign in before saving records.';
            return;
        }

        try {
            const collectionName = type === 'farmer' ? 'farmers' : 'buyerRequests';
            await addDoc(collection(db, collectionName), {
                ...record,
                ownerUid: currentUser.uid,
                createdAt: serverTimestamp()
            });
            errorElement.textContent = '';
            form.reset();
            form.closest('dialog').close();
        } catch (error) {
            console.error(`Unable to save ${type} record:`, error);
            errorElement.textContent = `Could not save this record: ${error.message}`;
        }
    }

    async function seedCollectionIfEmpty(collectionName, records, user) {
        const ownerQuery = query(
            collection(db, collectionName),
            where('ownerUid', '==', user.uid)
        );
        const existingRecords = await getDocs(ownerQuery);
        if (!existingRecords.empty) return;

        const batch = writeBatch(db);
        records.forEach((record, index) => {
            const { id, ...fields } = record;
            batch.set(doc(db, collectionName, `sample-${user.uid}-${index + 1}`), {
                ...fields,
                ownerUid: user.uid,
                createdAt: serverTimestamp()
            });
        });
        await batch.commit();
    }

    async function seedDemoData(user) {
        const legacyData = readLegacyData();
        await seedCollectionIfEmpty('farmers', legacyData?.farmers || initialData.farmers, user);
        await seedCollectionIfEmpty('buyerRequests', legacyData?.buyers || initialData.buyers, user);
    }

    function showFirebaseNotice(message) {
        let notice = byId('firebaseNotice');
        if (!notice) {
            notice = document.createElement('p');
            notice.id = 'firebaseNotice';
            notice.className = 'firebase-notice';
            document.querySelector('.page-content')?.prepend(notice);
        }
        if (notice) notice.textContent = message;
    }

    function stopRecordListeners() {
        if (unsubscribeFarmers) unsubscribeFarmers();
        if (unsubscribeBuyers) unsubscribeBuyers();
        unsubscribeFarmers = null;
        unsubscribeBuyers = null;
        data = { farmers: [], buyers: [] };
    }

    function subscribeToRecords(user) {
        const farmersQuery = query(
            collection(db, 'farmers'),
            where('ownerUid', '==', user.uid)
        );
        const buyersQuery = query(
            collection(db, 'buyerRequests'),
            where('ownerUid', '==', user.uid)
        );

        unsubscribeFarmers = onSnapshot(farmersQuery, snapshot => {
            data.farmers = snapshot.docs.map(record => ({
                ...record.data(),
                id: record.id
            }));
            render();
        }, error => {
            console.error('Unable to load farmers from Firestore:', error);
            showFirebaseNotice(`Could not load farmers: ${error.message}`);
        });

        unsubscribeBuyers = onSnapshot(buyersQuery, snapshot => {
            data.buyers = snapshot.docs.map(record => ({
                ...record.data(),
                id: record.id
            }));
            render();
        }, error => {
            console.error('Unable to load buyer requests from Firestore:', error);
            showFirebaseNotice(`Could not load buyer requests: ${error.message}`);
        });
    }

    function setupAuthUI() {
        const authGate = document.createElement('section');
        authGate.id = 'authGate';
        authGate.className = 'auth-gate';
        authGate.innerHTML = `
            <form id="authForm" class="auth-card">
                <span class="brand-mark auth-logo">C</span>
                <p class="eyebrow">CROPLINK COORDINATOR</p>
                <h1>Sign in to your workspace</h1>
                <p class="muted">Use the email and password created in Firebase Authentication.</p>
                <label>Email address<input name="email" type="email" autocomplete="username" required></label>
                <label>Password<input name="password" type="password" autocomplete="current-password" required></label>
                <p id="authError" class="form-error" role="alert"></p>
                <button class="button button-primary auth-submit" type="submit">Sign in</button>
            </form>`;
        document.body.append(authGate);

        document.querySelectorAll('.topbar-actions').forEach(actions => {
            const signOutButton = document.createElement('button');
            signOutButton.id = 'signOutButton';
            signOutButton.className = 'button button-quiet sign-out-button';
            signOutButton.type = 'button';
            signOutButton.textContent = 'Sign out';
            actions.append(signOutButton);
        });

        byId('authForm').addEventListener('submit', async event => {
            event.preventDefault();
            const form = event.currentTarget;
            const button = form.querySelector('button[type="submit"]');
            const errorElement = byId('authError');
            button.disabled = true;
            errorElement.textContent = '';
            try {
                await signInWithEmailAndPassword(
                    auth,
                    String(new FormData(form).get('email')).trim(),
                    String(new FormData(form).get('password'))
                );
                form.reset();
            } catch (error) {
                console.error('Firebase sign-in failed:', error);
                errorElement.textContent = `Sign-in failed: ${error.message}`;
            } finally {
                button.disabled = false;
            }
        });

        byId('signOutButton').addEventListener('click', async () => {
            try {
                await signOut(auth);
            } catch (error) {
                console.error('Firebase sign-out failed:', error);
                showFirebaseNotice(`Could not sign out: ${error.message}`);
            }
        });
    }

    function startAuthListener() {
        onAuthStateChanged(auth, async user => {
            stopRecordListeners();
            currentUser = user;
            byId('authGate').hidden = Boolean(user);
            const status = document.querySelector('.status-pill');

            if (!user) {
                if (status) status.innerHTML = '<i></i> Sign-in required';
                render();
                return;
            }

            if (status) status.innerHTML = '<i></i> Firebase connected';
            try {
                await seedDemoData(user);
                subscribeToRecords(user);
            } catch (error) {
                console.error('Unable to initialize CropLink Firestore data:', error);
                showFirebaseNotice(`Firestore setup failed: ${error.message}. Check that your Firestore rules allow this signed-in user.`);
            }
        }, error => {
            console.error('Firebase authentication state failed:', error);
            showFirebaseNotice(`Authentication error: ${error.message}`);
        });
    }

    function bindEvents() {
        byId('farmerSearch')?.addEventListener('input', renderFarmers);
        byId('buyerSearch')?.addEventListener('input', renderBuyers);
        byId('matchSearch')?.addEventListener('input', () => renderMatches(getMatches()));

        byId('addFarmerButton')?.addEventListener('click', () => byId('farmerDialog').showModal());
        byId('addBuyerButton')?.addEventListener('click', () => byId('buyerDialog').showModal());
        byId('farmerForm')?.addEventListener('submit', event => {
            event.preventDefault();
            addRecord('farmer', event.currentTarget);
        });
        byId('buyerForm')?.addEventListener('submit', event => {
            event.preventDefault();
            addRecord('buyer', event.currentTarget);
        });
        document.querySelectorAll('[data-close-dialog]').forEach(button => {
            button.addEventListener('click', () => button.closest('dialog').close());
        });
        byId('refreshMatches')?.addEventListener('click', () => renderMatches(getMatches()));
        byId('runAllocation')?.addEventListener('click', () => {
            renderAllocations(getMatches());
            const label = byId('allocationResultLabel');
            if (label) label.textContent = `Updated ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
        });
    }

    function render() {
        const matches = getMatches();
        renderNavigationCounts();
        renderDashboard(matches);
        renderFarmers();
        renderBuyers();
        renderMatches(matches);
        renderAllocations(matches);
    }

    fillLocationSelects();
    bindEvents();
    setupAuthUI();
    render();
    startAuthListener();
})();
