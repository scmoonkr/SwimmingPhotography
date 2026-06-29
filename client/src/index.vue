<script setup>
// 기본 홈 페이지. CMS 화면을 여기서부터 확장한다.
const galleries = [
  { name: 'racingcaps', path: '/racingcaps' },
  { name: 'racingcaps1', path: '/racingcaps1' },
]
</script>

<template>
  <main class="home">
    <h1>SwimmingPhotography</h1>
    <p class="subtitle">수영 대회 사진 서비스</p>

    <section class="links">
      <h2>정적 페이지</h2>
      <ul>
        <li v-for="g in galleries" :key="g.path">
          <a :href="g.path">{{ g.name }}</a>
        </li>
      </ul>
    </section>
  </main>
</template>

<style scoped>
.home {
  max-width: 720px;
  margin: 0 auto;
  padding: 3rem 1.5rem;
}

h1 {
  font-size: 2rem;
  font-weight: 700;
}

.subtitle {
  color: #666;
  margin-top: 0.25rem;
}

.links {
  margin-top: 2rem;
}

.links h2 {
  font-size: 1.1rem;
  margin-bottom: 0.5rem;
}

.links ul {
  list-style: none;
  padding: 0;
}

.links li {
  margin: 0.25rem 0;
}

.links a {
  color: #2563eb;
  text-decoration: none;
}

.links a:hover {
  text-decoration: underline;
}
</style>
